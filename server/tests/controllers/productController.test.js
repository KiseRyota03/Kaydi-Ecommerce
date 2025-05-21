/**
 * @jest-environment node
 */
const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const {
  connect,
  closeDatabase,
  clearDatabase,
} = require("../setup/mongoMemoryServer");

const Product = require("../../models/productModel").default;
const productController = require("../../controllers/productController");
const { createProduct } = require("../helpers/productHelper");

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

// Setup test app
const setupApp = (isAdmin = true) => {
  const app = express();
  app.use(express.json());
  
  // Fake auth middleware
  app.use((req, res, next) => {
    req.user = { id: isAdmin ? "admin123" : "user123", isAdmin: isAdmin };
    next();
  });
  
  // Bind routes
  app.post("/product/create", productController.createProduct);
  app.get("/product/recent/:limitNumber", productController.getRecentProduct);
  app.get("/product/all", productController.getAllProduct);
  app.get("/product/pagination", productController.getProductPagination);
  app.put("/product/update/:productId", productController.updateProduct);
  app.delete("/product/delete/:productId", productController.deleteProduct);
  app.get("/product/each/:productId", productController.getEachProduct);
  app.get("/product/search/:searchKey", productController.getProductBySearch);
  app.get("/product/category/:category", productController.getProductByCategory);
  app.get("/product/price", productController.getProductByPriceRange);
  app.post("/product/filter/:filterType", productController.getProductByFilter);
  app.get("/product/combination/:category", productController.getProductCombination);
  app.get("/product/recommend/:productId", productController.getRecommendProducts);
  app.get("/product/search-admin/:searchKey", productController.searchProductAdmin);
  app.get("/product/export", productController.exportProducts);

  return app;
};

// Setup test data
const validProduct = {
  name: "Test Product",
  description: "A great product",
  price: 100,
  stock: 10,
  categories: ["shirt"],
  sizes: ["M"],
  colors: ["Red"],
  listingPhotoPaths: ["img1.jpg"],
};

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Product Controller Tests", () => {
  
  describe("1. Basic CRUD Functionality", () => {
    test("#TC001 - create product and check DB", async () => {
      const app = setupApp();
      const res = await request(app).post("/product/create").send(validProduct);
      
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Test Product");

      const inDb = await Product.findOne({ name: "Test Product" });
      expect(inDb).not.toBeNull();
      expect(inDb.price).toBe(100);
    });

    test("#TC002 - get recent products", async () => {
      const app = setupApp();
      await createProduct({ name: "Recent" });
      
      const res = await request(app).get("/product/recent/1");
      
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].name).toBe("Recent");
    });

    test("#TC003 - get all products", async () => {
      const app = setupApp();
      await createProduct({ name: "Full" });
      
      const res = await request(app).get("/product/all");
      
      expect(res.status).toBe(200);
      expect(res.body.totalNumber).toBe(1);
      expect(res.body.allProducts[0].name).toBe("Full");
    });

    test("#TC004 - get paginated products", async () => {
      const app = setupApp();
      await createProduct({ name: "Paginated" });
      
      const res = await request(app).get("/product/pagination?page=1&limit=1");
      
      expect(res.status).toBe(200);
      expect(res.body.listProducts.length).toBeGreaterThan(0);
      expect(res.body.listProducts[0].name).toBe("Paginated");
    });

    test("#TC005 - update product and verify DB", async () => {
      const app = setupApp();
      const product = await createProduct({ name: "Old" });
      
      const res = await request(app)
        .put(`/product/update/${product._id}`)
        .send({
          name: "Updated",
          description: "Updated desc",
          price: 200,
          stock: 5,
          categories: ["pants"],
          sizes: ["L"],
          colors: ["Black"],
          listingPhotoPaths: ["img2.jpg"],
        });
      
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated");

      const updated = await Product.findById(product._id);
      expect(updated.name).toBe("Updated");
      expect(updated.price).toBe(200);
    });

    test("#TC006 - delete product and verify DB", async () => {
      const app = setupApp();
      const product = await createProduct({ name: "ToDelete" });
      
      const res = await request(app).delete(`/product/delete/${product._id}`);
      
      expect(res.status).toBe(200);

      const inDb = await Product.findById(product._id);
      expect(inDb).toBeNull();
    });

    test("#TC007 - get specific product by ID", async () => {
      const app = setupApp();
      const product = await createProduct({ name: "Specific" });
      
      const res = await request(app).get(`/product/each/${product._id}`);
      
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Specific");
    });
  });

  describe("2. Search and Filtering", () => {
    test("#TC008 - search by keyword", async () => {
      const app = setupApp();
      await createProduct({ name: "Searchable" });
      
      const res = await request(app).get("/product/search/Searchable");
      
      expect(res.status).toBe(200);
      expect(res.body.findProducts.length).toBeGreaterThan(0);
    });

    test("#TC009 - filter by category", async () => {
      const app = setupApp();
      await createProduct({ name: "CatProd", categories: ["accessory"] });
      
      const res = await request(app).get("/product/category/accessory");
      
      expect(res.status).toBe(200);
      expect(res.body.findProductByCategory.length).toBeGreaterThan(0);
    });

    test("#TC010 - filter by price range", async () => {
      const app = setupApp();
      await createProduct({ name: "PriceRange", price: 150 });
      
      const res = await request(app).get("/product/price?minPrice=100&maxPrice=200");
      
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeGreaterThan(0);
    });

    test("#TC011 - sort by nameAZ", async () => {
      const app = setupApp();
      const products = [
        { name: "Zeta", price: 100 },
        { name: "Alpha", price: 50 },
      ];
      
      const res = await request(app)
        .post("/product/filter/nameAZ")
        .send({ products });
      
      expect(res.status).toBe(200);
      expect(res.body[0].name).toBe("Alpha");
    });

    test("#TC012 - filter by combination of category + price", async () => {
      const app = setupApp();
      await createProduct({ name: "Combo", price: 120, categories: ["shirt"] });
      
      const res = await request(app).get("/product/combination/shirt?minPrice=100&maxPrice=200");
      
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeGreaterThan(0);
    });

    test("#TC013 - recommend products based on related category", async () => {
      const app = setupApp();
      const main = await createProduct({
        name: "Recommender",
        categories: ["shirt"],
      });
      await createProduct({ name: "Recommended", categories: ["pants"] });

      const res = await request(app).get(`/product/recommend/${main._id}`);
      
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    test("#TC014 - search product as admin", async () => {
      const app = setupApp();
      await createProduct({ name: "AdminProd" });
      
      const res = await request(app).get("/product/search-admin/AdminProd");
      
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe("3. Authorization Tests", () => {
    test("#TC015 - create product - unauthorized user", async () => {
      const app = setupApp(false); // non-admin
      
      const res = await request(app).post("/product/create").send(validProduct);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to create product");
    });

    test("#TC016 - update product - not admin", async () => {
      const product = await createProduct({ name: "ToUpdate" });
      const app = setupApp(false); // non-admin

      const res = await request(app)
        .put(`/product/update/${product._id}`)
        .send({ name: "FailUpdate" });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to update product");
    });

    test("#TC017 - delete product - not admin", async () => {
      const product = await createProduct();
      const app = setupApp(false); // non-admin

      const res = await request(app).delete(`/product/delete/${product._id}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to delete product");
    });

    test("#TC018 - search as admin - unauthorized", async () => {
      const app = setupApp(false); // non-admin

      const res = await request(app).get("/product/search-admin/Test");
      
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("You are not admin to perform this action.");
    });

    test("#TC019 - export products - unauthorized", async () => {
      const app = setupApp(false); // non-admin

      const res = await request(app).get("/product/export");
      
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to export users");
    });
  });

  describe("4. Empty DB & Not Found Scenarios", () => {
    test("#TC020 - get recent product - no products", async () => {
      const app = setupApp();
      
      const res = await request(app).get("/product/recent/5");
      
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No product found");
    });

    test("#TC021 - get all products - empty DB", async () => {
      const app = setupApp();
      
      const res = await request(app).get("/product/all");
      
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No product found");
    });

    test("#TC022 - get pagination - no products", async () => {
      const app = setupApp();
      
      const res = await request(app).get("/product/pagination?page=1&limit=1");
      
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No product found");
    });

    test("#TC023 - get product by ID - not found", async () => {
      const app = setupApp();
      const id = new mongoose.Types.ObjectId();
      
      const res = await request(app).get(`/product/each/${id}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No product found!");
    });

    test("#TC024 - search product - keyword not matched", async () => {
      const app = setupApp();
      
      const res = await request(app).get("/product/search/nonexistent");
      
      expect(res.body.message).toBe("No product found with this name");
    });

    test("#TC025 - filter by category - empty", async () => {
      const app = setupApp();
      
      const res = await request(app).get("/product/category/fake-category");
      
      expect(res.body.message).toBe("No product match in this category");
    });

    test("#TC026 - combination filter - no match", async () => {
      const app = setupApp();
      
      const res = await request(app).get("/product/combination/shirt?minPrice=9999&maxPrice=10000");
      
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No products match your criteria.");
    });

    test("#TC027 - recommend - no match", async () => {
      const app = setupApp();
      const prod = await createProduct({ name: "Solo", categories: ["rare"] });
      
      const res = await request(app).get(`/product/recommend/${prod._id}`);
      
      expect(res.body.message).toBe("No product match in this category");
    });
  });

  describe("5. Invalid Input Handling", () => {
    test("#TC028 - create product - missing required fields", async () => {
      const app = setupApp();
      
      const res = await request(app).post("/product/create").send({
        // Missing name and price
        description: "Incomplete product",
        stock: 5,
        categories: ["shirt"],
      });
      
      expect(res.status).toBe(500); // Assuming your error middleware returns 500 for validation errors
    });

    test("#TC029 - create product - invalid price (negative)", async () => {
      const app = setupApp();
      
      const res = await request(app).post("/product/create").send({
        ...validProduct,
        price: -100, // Negative price
      });
      
      expect(res.status).toBe(500); // Model validation should reject negative price
    });

    test("#TC030 - update product - invalid stock (negative)", async () => {
      const app = setupApp();
      const product = await createProduct(validProduct);
      
      const res = await request(app)
        .put(`/product/update/${product._id}`)
        .send({
          ...validProduct,
          stock: -10, // Negative stock
        });
      
      expect(res.status).toBe(500); // Model validation should reject negative stock
    });

    test("#TC031 - create product - invalid data types", async () => {
      const app = setupApp();
      
      const res = await request(app).post("/product/create").send({
        ...validProduct,
        price: "not-a-number", // String instead of number
        categories: "not-an-array", // String instead of array
      });
      
      expect(res.status).toBe(500); // Model validation should reject invalid types
    });

    test("#TC032 - filter - invalid payload", async () => {
      const app = setupApp();
      
      const res = await request(app)
        .post("/product/filter/nameAZ")
        .send({ products: "not-an-array" });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid products data!");
    });

    test("#TC033 - filter - invalid filter type", async () => {
      const app = setupApp();
      
      const res = await request(app)
        .post("/product/filter/invalidFilter")
        .send({ products: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid filter type!");
    });

    test("#TC034 - get product with invalid ObjectId format", async () => {
      const app = setupApp();
      
      const res = await request(app).get(`/product/each/invalid-id-format`);

      expect(res.status).toBe(500); // Mongoose should reject invalid ObjectId
    });
  });

  describe("6. Edge Cases", () => {
    test("#TC035 - pagination with page=0", async () => {
      const app = setupApp();
      await createProduct(validProduct);
      
      const res = await request(app).get("/product/pagination?page=0&limit=10");
      
      // Either return error or handle it by defaulting to page 1
      expect(res.status).toBe(200);
      expect(res.body.currentPage).toBe(1); // Should default to page 1
    });

    test("#TC036 - pagination with negative limit", async () => {
      const app = setupApp();
      await createProduct(validProduct);
      
      const res = await request(app).get("/product/pagination?page=1&limit=-5");
      
      // Should handle negative limit gracefully
      expect(res.status).toBe(200);
      expect(res.body.listProducts.length).toBeGreaterThan(0);
    });

    test("#TC037 - price range with minPrice > maxPrice", async () => {
      const app = setupApp();
      await createProduct({ ...validProduct, price: 150 });
      
      const res = await request(app).get("/product/price?minPrice=200&maxPrice=100");
      
      // Should return no products or handle this case appropriately
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBe(0);
    });

    test("#TC038 - search with empty string", async () => {
      const app = setupApp();
      await createProduct(validProduct);
      
      const res = await request(app).get("/product/search/ ");
      
      // Should handle empty search term gracefully
      expect(res.status).toBe(200);
      // Could either return all products or a specific message
    });

    test("#TC039 - create product with extremely large price", async () => {
      const app = setupApp();
      
      const res = await request(app).post("/product/create").send({
        ...validProduct,
        price: Number.MAX_SAFE_INTEGER, // Extremely large number
      });
      
      // Should handle large numbers appropriately
      expect(res.status).toBe(201);
      expect(res.body.price).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("#TC040 - create product with zero price", async () => {
      const app = setupApp();
      
      const res = await request(app).post("/product/create").send({
        ...validProduct,
        price: 0, // Zero price
      });
      
      // Should handle zero price appropriately
      expect(res.status).toBe(201);
      expect(res.body.price).toBe(0);
    });

    test("#TC041 - create product with empty arrays", async () => {
      const app = setupApp();
      
      const res = await request(app).post("/product/create").send({
        ...validProduct,
        categories: [], // Empty array
        sizes: [],      // Empty array
        colors: [],     // Empty array
      });
      
      // Should handle empty arrays appropriately
      expect(res.status).toBe(201);
      expect(res.body.categories).toEqual([]);
      expect(res.body.sizes).toEqual([]);
      expect(res.body.colors).toEqual([]);
    });
  });

  describe("7. Special Search Cases", () => {
    test("#TC042 - search by keyword with special characters", async () => {
      const app = setupApp();
      await createProduct({ name: "Special+Product#2" });
      
      const res = await request(app).get("/product/search/Special+Product");
      
      expect(res.status).toBe(200);
      expect(res.body.findProducts.length).toBeGreaterThan(0);
    });

    test("#TC043 - search by keyword with and without diacritics", async () => {
      const app = setupApp();
      await createProduct({ name: "áo polo" });

      const resWithoutDiacritics = await request(app).get("/product/search/ao polo");
      
      expect(resWithoutDiacritics.status).toBe(200);
      expect(resWithoutDiacritics.body.findProducts.length).toBeGreaterThan(0);
    });

    test("#TC044 - search by keyword with slight misspelling", async () => {
      const app = setupApp();
      await createProduct({ name: "Áo Polo" });

      const res = await request(app).get("/product/search/Ao Polo");
      
      expect(res.status).toBe(200);
      expect(res.body.findProducts.length).toBeGreaterThan(0);
    });

    test("#TC045 - search with extremely long keyword", async () => {
      const app = setupApp();
      await createProduct({ name: "Regular Product" });
      
      // Create a very long search term
      const longSearchTerm = "a".repeat(500);
      
      const res = await request(app).get(`/product/search/${longSearchTerm}`);
      
      // Should handle gracefully without crashing
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("No product found with this name");
    });
  });

  describe("8. Export Functionality", () => {
    test("#TC046 - export products - success", async () => {
      const app = setupApp();
      await createProduct(validProduct);
      
      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        end: jest.fn(),
      };
      
      // This is a simplified test since we're mocking ExcelJS
      await productController.exportProducts({ user: { isAdmin: true } }, mockRes);
      
      expect(mockRes.setHeader).toHaveBeenCalledTimes(2);
      expect(mockRes.end).toHaveBeenCalled();
    });
  });
});