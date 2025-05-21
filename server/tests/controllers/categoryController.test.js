/**
 * @jest-environment node
 */
const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const {
  connect,
  clearDatabase,
  closeDatabase,
} = require("../setup/mongoMemoryServer");

const Category = require("../../models/categoryModel").default;
const categoryController = require("../../controllers/categoryController");
const { createCategory } = require("../helpers/categoryHelper");

// Mock ExcelJS to prevent actual file creation during tests
jest.mock("exceljs", () => {
  return {
    Workbook: jest.fn().mockImplementation(() => {
      return {
        addWorksheet: jest.fn().mockReturnValue({
          columns: [],
          addRow: jest.fn(),
        }),
        xlsx: {
          write: jest.fn().mockResolvedValue(true),
        },
      };
    }),
  };
});

// Setup test app with correct routes matching the actual application
const setupApp = (isAdmin = true) => {
  const app = express();
  app.use(express.json());
  
  // Fake auth middleware to simulate verifyToken
  app.use((req, res, next) => {
    req.user = { id: isAdmin ? "admin123" : "user123", isAdmin: isAdmin };
    next();
  });
  
  // Bind routes using the actual route structure from the application
  app.post("/create", categoryController.createCategory);
  app.get("/getAllCategories", categoryController.getAllCategories);
  app.get("/getCategoriesFromNewest", categoryController.getCategoriesFromNewest);
  app.delete("/delete/:categoryId", categoryController.deleteCategory);
  app.put("/update/:categoryId", categoryController.updateCategory);
  app.get("/getEachCategory/:categoryId", categoryController.getEachCategory);
  app.get("/getCategoryByName/:name", categoryController.getCategoryByName);
  app.get("/exportCategories", categoryController.exportCategories);

  return app;
};

// Valid category data for testing
const validCategory = {
  name: "test-category",
  title: "Test Category",
  description: ["Test description"],
  heroImage: "test.jpg",
};

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Category Controller Tests", () => {
  
  describe("1. createCategory()", () => {
    test("#TC001 - create a category as admin", async () => {
      const app = setupApp(true);
      const res = await request(app)
        .post("/create")
        .send(validCategory);

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("test-category");

      const dbCat = await Category.findOne({ name: "test-category" });
      expect(dbCat).not.toBeNull();
      expect(dbCat.title).toBe("Test Category");
    });

    test("#TC002 - create category - unauthorized user", async () => {
      const app = setupApp(false);
      
      const res = await request(app)
        .post("/create")
        .send(validCategory);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to create category");
    });

    test("#TC003 - create category - missing required fields", async () => {
      const app = setupApp();
      
      const res = await request(app)
        .post("/create")
        .send({
          // Missing name field which is required
          title: "Missing Name Category",
          description: ["Description without name"],
          heroImage: "no-name.jpg",
        });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe("Internal server error");
    });

    test("#TC004 - create category - duplicate name", async () => {
      const app = setupApp();
      await createCategory({ name: "duplicate" });
      
      const res = await request(app)
        .post("/create")
        .send({
          name: "duplicate",
          title: "Duplicate Name",
          description: ["This should fail"],
          heroImage: "duplicate.jpg",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/category with this name already exists/i);
    });

    test("#TC005 - create category - invalid data types", async () => {
      const app = setupApp();
      
      const res = await request(app)
        .post("/create")
        .send({
          name: "invalid-types",
          title: 12345, // Number instead of string
          description: "Not an array", // String instead of array
          heroImage: { url: "not-a-string.jpg" }, // Object instead of string
        });

      expect(res.status).toBe(500);
    });

    test("#TC006 - create category - empty description array", async () => {
      const app = setupApp();
      
      const res = await request(app)
        .post("/create")
        .send({
          name: "empty-array",
          title: "Empty Array Category",
          description: [], // Empty array
          heroImage: "empty.jpg",
        });

      expect(res.status).toBe(201);
      expect(res.body.description).toEqual([]);
    });

    test("#TC007 - create category - extremely long name", async () => {
      const app = setupApp();
      
      const longName = "a".repeat(300); // Very long name
      
      const res = await request(app)
        .post("/create")
        .send({
          name: longName,
          title: "Long Name Category",
          description: ["Testing long name"],
          heroImage: "long.jpg",
        });

      // Either expect a 500 error if there's validation in the model,
      // or a 201 success if it accepts long names
      if (res.status === 500) {
        expect(res.body.message).toBe("Internal server error");
      } else {
        expect(res.status).toBe(201);
        expect(res.body.name).toBe(longName);
      }
    });
  });

  describe("2. getAllCategories()", () => {
    test("#TC008 - get all categories with stats", async () => {
      const app = setupApp();
      await createCategory({ name: "cat1" });
      await createCategory({ name: "cat2" });
      
      const res = await request(app).get("/getAllCategories");
      
      expect(res.status).toBe(200);
      expect(res.body.totalCategory).toBe(2);
      expect(res.body.allCategories.length).toBe(2);
      expect(res.body).toHaveProperty("lastWeekCategoryCount");
      expect(res.body).toHaveProperty("lastMonthCategoryCount");
    });

    test("#TC009 - get all categories - empty DB", async () => {
      const app = setupApp();
      
      const res = await request(app).get("/getAllCategories");
      
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No category found");
    });
  });

  describe("3. getCategoriesFromNewest()", () => {
    test("#TC010 - get categories sorted by newest", async () => {
      const app = setupApp();
      
      // Create categories with different dates
      await createCategory({ 
        name: "old-cat", 
        createdAt: new Date("2020-01-01") 
      });
      
      await createCategory({ 
        name: "new-cat" 
      }); // Current date - newest
      
      const res = await request(app).get("/getCategoriesFromNewest");
      
      expect(res.status).toBe(200);
      expect(res.body.allCategories[0].name).toBe("new-cat");
      expect(res.body.allCategories[1].name).toBe("old-cat");
    });

    test("#TC011 - get newest categories - empty DB", async () => {
      const app = setupApp();
      
      const res = await request(app).get("/getCategoriesFromNewest");
      
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No category found");
    });
  });

  describe("4. getEachCategory()", () => {
    test("#TC012 - get specific category by ID as admin", async () => {
      const app = setupApp(true);
      const cat = await createCategory({ name: "specific-cat" });
      
      const res = await request(app).get(`/getEachCategory/${cat._id}`);
      
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("specific-cat");
    });

    test("#TC013 - get category - unauthorized user", async () => {
      const app = setupApp(false);
      const cat = await createCategory({ name: "private-cat" });
      
      const res = await request(app).get(`/getEachCategory/${cat._id}`);
      
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to view this category");
    });

    test("#TC014 - get category with non-existent ID", async () => {
      const app = setupApp();
      const nonExistentId = new mongoose.Types.ObjectId();
      
      const res = await request(app).get(`/getEachCategory/${nonExistentId}`);
      
      // Assuming the controller returns 404 for non-existent IDs
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No category found with this id");
    });

    test("#TC015 - get category with invalid ObjectId format", async () => {
      const app = setupApp();
      
      const res = await request(app).get(`/getEachCategory/invalid-id-format`);
      
      // Assuming the controller returns 500 for invalid MongoDB ObjectIds
      expect(res.status).toBe(500);
    });
  });

  describe("5. getCategoryByName()", () => {
    test("#TC016 - get category by name", async () => {
      const app = setupApp();
      await createCategory({ 
        name: "name-search", 
        title: "Name Search Category" 
      });
      
      const res = await request(app).get("/getCategoryByName/name-search");
      
      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Name Search Category");
    });

    test("#TC017 - get category by name - not found", async () => {
      const app = setupApp();
      
      const res = await request(app).get("/getCategoryByName/nonexistent-name");
      
      // Assuming the controller returns 404 for non-existent names
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No category found with this name");
    });

    test("#TC018 - get category by name - case sensitivity", async () => {
      const app = setupApp();
      await createCategory({ 
        name: "CaseSensitive", 
        title: "Case Sensitive Test" 
      });
      
      // Test with different case
      const res = await request(app).get("/getCategoryByName/casesensitive");
      
      // Depending on how the model is set up, this might be 200 or 404
      if (res.status === 200) {
        expect(res.body.title).toBe("Case Sensitive Test");
      } else {
        expect(res.status).toBe(404);
        expect(res.body.message).toBe("No category found with this name");
      }
    });

    test("#TC019 - get category with special characters in name", async () => {
      const app = setupApp();
      await createCategory({ 
        name: "special@chars#category", 
        title: "Special Characters" 
      });
      
      const res = await request(app).get("/getCategoryByName/special@chars%23category");
      
      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Special Characters");
    });
  });

  describe("6. updateCategory()", () => {
    test("#TC020 - update category as admin", async () => {
      const app = setupApp(true);
      const cat = await createCategory({ 
        name: "to-update", 
        title: "Original Title" 
      });
      
      const res = await request(app)
        .put(`/update/${cat._id}`)
        .send({
          name: "updated-name",
          title: "Updated Title",
          description: ["New description"],
          heroImage: "updated.jpg",
        });
      
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("updated-name");
      expect(res.body.title).toBe("Updated Title");
      
      const updated = await Category.findById(cat._id);
      expect(updated.title).toBe("Updated Title");
    });

    test("#TC021 - update category - unauthorized user", async () => {
      const app = setupApp(false);
      const cat = await createCategory({ name: "no-update-perm" });
      
      const res = await request(app)
        .put(`/update/${cat._id}`)
        .send({
          name: "attempted-update",
          title: "Unauthorized Update",
          description: ["Should fail"],
          heroImage: "unauth.jpg",
        });
      
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to update category");
    });

    test("#TC022 - update category with non-existent ID", async () => {
      const app = setupApp();
      const nonExistentId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .put(`/update/${nonExistentId}`)
        .send({
          name: "update-nonexistent",
          title: "Update Nonexistent",
          description: ["Should fail"],
          heroImage: "nonexistent.jpg",
        });
      
      // Should return 404 for non-existent IDs
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Category not found");
    });

    test("#TC023 - update category with invalid ObjectId format", async () => {
      const app = setupApp();
      
      const res = await request(app)
        .put(`/update/invalid-id-format`)
        .send({
          name: "invalid-id-update",
          title: "Invalid ID Update",
          description: ["Should fail"],
          heroImage: "invalid.jpg",
        });
      
      // Should return 500 for invalid MongoDB ObjectIds
      expect(res.status).toBe(500);
    });

    test("#TC024 - update category with invalid data types", async () => {
      const app = setupApp();
      const cat = await createCategory({ name: "type-update" });
      
      const res = await request(app)
        .put(`/update/${cat._id}`)
        .send({
          name: "type-update",
          title: 12345, // Number instead of string
          description: "Not an array", // String instead of array
          heroImage: { url: "not-a-string.jpg" }, // Object instead of string
        });
      
      // Should return an error for invalid types
      expect(res.status).toBe(500);
    });

    test("#TC025 - update category with duplicate name", async () => {
      const app = setupApp();
      await createCategory({ name: "existing-name" });
      const catToUpdate = await createCategory({ name: "will-duplicate" });
      
      const res = await request(app)
        .put(`/update/${catToUpdate._id}`)
        .send({
          name: "existing-name", // Already exists
          title: "Duplicate Update",
          description: ["Should fail"],
          heroImage: "duplicate.jpg",
        });
      
      // Should return 400 for duplicate name
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/category with this name already exists/i);
    });
  });

  describe("7. deleteCategory()", () => {
    test("#TC026 - delete category as admin", async () => {
      const app = setupApp(true);
      const cat = await createCategory({ name: "to-delete" });
      
      const res = await request(app).delete(`/delete/${cat._id}`);
      
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Category deleted successfully");
      
      const deleted = await Category.findById(cat._id);
      expect(deleted).toBeNull();
    });

    test("#TC027 - delete category - unauthorized user", async () => {
      const app = setupApp(false);
      const cat = await createCategory({ name: "no-delete-perm" });
      
      const res = await request(app).delete(`/delete/${cat._id}`);
      
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to delete category");
      
      const notDeleted = await Category.findById(cat._id);
      expect(notDeleted).not.toBeNull();
    });

    test("#TC028 - delete category with non-existent ID", async () => {
      const app = setupApp();
      const nonExistentId = new mongoose.Types.ObjectId();
      
      const res = await request(app).delete(`/delete/${nonExistentId}`);
      
      // Should return 404 for non-existent IDs
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Category not found");
    });

    test("#TC029 - delete category with invalid ObjectId format", async () => {
      const app = setupApp();
      
      const res = await request(app).delete(`/delete/invalid-id-format`);
      
      // Should return 500 for invalid MongoDB ObjectIds
      expect(res.status).toBe(500);
    });
  });

  describe("8. exportCategories()", () => {
    test("#TC030 - export categories as admin", async () => {
      const app = setupApp(true);
      await createCategory({ name: "export-cat-1" });
      await createCategory({ name: "export-cat-2" });
      
      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        end: jest.fn(),
      };
      
      // Since we mocked ExcelJS, we can test the export function directly
      await categoryController.exportCategories(
        { user: { isAdmin: true } }, 
        mockRes
      );
      
      expect(mockRes.setHeader).toHaveBeenCalledTimes(2);
      expect(mockRes.end).toHaveBeenCalled();
    });

    test("#TC031 - export categories - unauthorized user", async () => {
      const app = setupApp(false);
      
      const res = await request(app).get("/exportCategories");
      
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to export categories");
    });
  });
});