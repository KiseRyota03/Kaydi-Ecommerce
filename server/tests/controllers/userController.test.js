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
} = require("../setup/mongoMemoryServer.js");

const userController = require("../../controllers/userController.js");
const { createUser } = require("../helpers/userHelper.js");

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

const createAppWithAuth = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });

  // Map routes to controller methods directly as they are in the controller
  // These routes should match the real implementation
  app.get("/getallusers", userController.getAllUsers);
  app.get("/getuser/:userId", userController.getUser);
  app.put("/update/:userId", userController.updateUser);
  app.delete("/delete/:userId", userController.deleteUser);
  app.get("/exportUser", userController.exportToExcel);
  app.get("/searchUser", userController.searchUser);
  app.get("/getAllUsersToChat", userController.getAllUserToChat);
  app.get(
    "/getUserToAddInGroupChat/:chatId",
    userController.getUserToAddInGroupChat
  );
  app.get("/searchUserAdmin/:searchKey", userController.searchUserAdmin);

  return app;
};

let currentUserId;
let app;

beforeAll(async () => {
  await connect();
});

afterEach(async () => {
  await clearDatabase();
  currentUserId = null;
});

afterAll(async () => await closeDatabase());

describe("UserController Tests", () => {
  describe("1. getAllUsers Method", () => {
    beforeEach(() => {
      app = createAppWithAuth({ id: currentUserId, isAdmin: true });
    });

    test("#TC001 - getAllUsers: Successfully retrieve all users", async () => {
      await createUser();
      const res = await request(app).get("/getallusers");
      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(1);
    });

    test("#TC002 - getAllUsers: Non-admin access denied", async () => {
      const appNonAdmin = createAppWithAuth({ id: "nonadmin", isAdmin: false });
      const res = await request(appNonAdmin).get("/getallusers");
      expect(res.status).toBe(401);
      expect(res.body.message).toBe(
        "You dont have permission to do this action"
      );
    });

    test("#TC003 - getAllUsers: Empty database returns 404", async () => {
      const res = await request(app).get("/getallusers");
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No users were found");
    });

    test("#TC004 - getAllUsers: Pagination with negative page number", async () => {
      await createUser();
      const res = await request(app).get("/getallusers?page=-1");
      // Should handle gracefully by defaulting to page 1
      expect(res.status).toBe(200);
      expect(res.body.currentPage).toBe(1);
    });

    test("#TC005 - getAllUsers: Pagination with zero limit", async () => {
      await createUser();
      const res = await request(app).get("/getallusers?limit=0");
      // Should handle gracefully with a default limit
      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThan(0);
    });

    test("#TC006 - getAllUsers: Extremely large page value", async () => {
      await createUser();
      const res = await request(app).get("/getallusers?page=999999");
      // Should return empty results for a page far beyond data
      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(0);
    });
  });

  describe("2. getUser Method", () => {
    beforeEach(() => {
      app = createAppWithAuth({ id: currentUserId, isAdmin: true });
    });

    test("#TC007 - getUser: Successfully retrieve user by ID", async () => {
      const user = await createUser();
      const res = await request(app).get(`/getuser/${user._id}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(user.email);
    });

    test("#TC008 - getUser: Non-existent user ID", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/getuser/${nonExistentId}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("User not found");
    });

    test("#TC009 - getUser: Malformed user ID format", async () => {
      const res = await request(app).get("/getuser/invalid-id-format");
      expect(res.status).toBe(500); // Should return error for invalid ObjectId
    });
  });

  describe("3. updateUser Method", () => {
    test("#TC010 - updateUser: Successfully update username", async () => {
      const user = await createUser();
      app = createAppWithAuth({ id: user._id.toString(), isAdmin: false });

      const res = await request(app)
        .put(`/update/${user._id}`)
        .send({ username: "UpdatedName" });

      expect(res.status).toBe(200);
      expect(res.body.username).toBe("UpdatedName");
    });

    test("#TC011 - updateUser: Unauthorized user attempt", async () => {
      const user = await createUser();
      app = createAppWithAuth({
        id: new mongoose.Types.ObjectId().toString(),
        isAdmin: false,
      });

      const res = await request(app)
        .put(`/update/${user._id}`)
        .send({ username: "ShouldFail" });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(
        "You don't have permission to do this action"
      );
    });

    test("#TC012 - updateUser: Password too short", async () => {
      const user = await createUser();
      app = createAppWithAuth({ id: user._id.toString(), isAdmin: false });

      const res = await request(app)
        .put(`/update/${user._id}`)
        .send({ password: "123" });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "Password must be at least 6 characters long"
      );
    });

    test("#TC013 - updateUser: Invalid email format", async () => {
      const user = await createUser();
      app = createAppWithAuth({ id: user._id.toString(), isAdmin: false });

      const res = await request(app)
        .put(`/update/${user._id}`)
        .send({ email: "not-an-email" });

      expect(res.status).toBe(500); // Should reject invalid email format
    });

    test("#TC014 - updateUser: Malformed date of birth", async () => {
      const user = await createUser();
      app = createAppWithAuth({ id: user._id.toString(), isAdmin: false });

      const res = await request(app)
        .put(`/update/${user._id}`)
        .send({ dateOfBirth: "not-a-date" });

      expect(res.status).toBe(500); // Should reject invalid date format
    });

    test("#TC015 - updateUser: Extremely long username", async () => {
      const user = await createUser();
      app = createAppWithAuth({ id: user._id.toString(), isAdmin: false });

      const longUsername = "A".repeat(1000); // Excessively long username

      const res = await request(app)
        .put(`/update/${user._id}`)
        .send({ username: longUsername });

      expect(res.status).toBe(500); // Should reject excessively long username
    });
  });

  describe("4. deleteUser Method", () => {
    test("#TC016 - deleteUser: Successfully delete own user account", async () => {
      const user = await createUser();
      app = createAppWithAuth({ id: user._id.toString(), isAdmin: false });

      const res = await request(app).delete(`/delete/${user._id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User deleted successfully");
    });

    test("#TC017 - deleteUser: Unauthorized deletion attempt", async () => {
      const user = await createUser();
      app = createAppWithAuth({
        id: new mongoose.Types.ObjectId().toString(),
        isAdmin: false,
      });

      const res = await request(app).delete(`/delete/${user._id}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(
        "You dont have permission to do this action"
      );
    });

    test("#TC018 - deleteUser: Non-existent user ID", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      app = createAppWithAuth({ id: nonExistentId.toString(), isAdmin: false });

      const res = await request(app).delete(`/delete/${nonExistentId}`);

      // Should gracefully handle deleting non-existent user
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User deleted successfully");
    });

    test("#TC019 - deleteUser: Malformed user ID", async () => {
      app = createAppWithAuth({ id: "invalid-id", isAdmin: false });

      const res = await request(app).delete("/delete/invalid-id");

      expect(res.status).toBe(500); // Should return error for invalid ObjectId
    });
  });

  describe("5. exportToExcel Method", () => {
    test("#TC020 - exportToExcel: Admin can export users", async () => {
      app = createAppWithAuth({ id: "admin-id", isAdmin: true });
      await createUser();

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        end: jest.fn(),
      };

      // This is a simplified test since we're mocking ExcelJS
      await userController.exportToExcel({ user: { isAdmin: true } }, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledTimes(2);
      expect(mockRes.end).toHaveBeenCalled();
    });

    test("#TC021 - exportToExcel: Non-admin access denied", async () => {
      app = createAppWithAuth({ id: "non-admin", isAdmin: false });

      const res = await request(app).get("/exportUser");

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to export users");
    });
  });

  describe("6. searchUser Method", () => {
    let app, requesterUser;

    beforeEach(async () => {
      // Tạo một user giả để làm "người gửi request"
      requesterUser = await createUser({
        username: "RequesterUser",
        email: "requester@example.com",
        password: "123456",
      });

      // Gắn app có user mock đúng định dạng ObjectId
      app = createAppWithAuth({
        id: requesterUser._id.toString(),
        isAdmin: true,
      });
    });

    test("#TC022 - searchUser: Find user by username", async () => {
      // Tạo user sẽ được tìm thấy
      await createUser({
        username: "SearchableUser",
        email: "search@example.com",
        password: "123456",
      });

      // Gửi request để tìm theo username
      const res = await request(app).get("/searchUser?search=SearchableUser");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].username).toBe("SearchableUser");
    });
    test("#TC023 - searchUser: Find user by email", async () => {
      await createUser({ email: "findme@example.com" });

      const res = await request(app).get("/searchUser?search=findme@example");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].email).toBe("findme@example.com");
    });

    test("#TC024 - searchUser: No search results", async () => {
      await createUser({ username: "Different" });

      const res = await request(app).get("/searchUser?search=NonExistentUser");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User not found");
    });

    test("#TC025 - searchUser: Search with special characters", async () => {
      await createUser({ username: "User+123" });

      const res = await request(app).get("/searchUser?search=User+123");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test("#TC026 - searchUser: Empty search parameter", async () => {
      await createUser();

      const res = await request(app).get("/searchUser?search=");

      // Should handle empty search gracefully
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test("#TC027 - searchUser: Extremely long search term", async () => {
      await createUser();

      const longSearchTerm = "a".repeat(500);
      const res = await request(app).get(
        `/searchUser?search=${longSearchTerm}`
      );

      // Should handle long search term without crashing
      expect(res.status).toBe(200);
    });
  });

  describe("7. searchUserAdmin Method", () => {
    test("#TC028 - searchUserAdmin: Admin can search by username", async () => {
      app = createAppWithAuth({ id: "admin-id", isAdmin: true });
      await createUser({ username: "AdminSearchable" });

      const res = await request(app).get("/searchUserAdmin/AdminSearchable");

      expect(res.status).toBe(200);
      expect(res.body[0].username).toBe("AdminSearchable");
    });

    test("#TC029 - searchUserAdmin: Admin can search by ID", async () => {
      app = createAppWithAuth({ id: "admin-id", isAdmin: true });
      const user = await createUser();

      const res = await request(app).get(`/searchUserAdmin/${user._id}`);

      expect(res.status).toBe(200);
      expect(res.body[0]._id).toBe(user._id.toString());
    });

    test("#TC030 - searchUserAdmin: Non-admin access denied", async () => {
      app = createAppWithAuth({ id: "non-admin", isAdmin: false });

      const res = await request(app).get("/searchUserAdmin/anyone");

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not allowed to search users");
    });

    test("#TC031 - searchUserAdmin: No search results", async () => {
      app = createAppWithAuth({ id: "admin-id", isAdmin: true });

      const res = await request(app).get("/searchUserAdmin/NonExistentUser");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User not found");
    });

    test("#TC032 - searchUserAdmin: Invalid ID format but valid search string", async () => {
      app = createAppWithAuth({ id: "admin-id", isAdmin: true });
      await createUser({ username: "123456" });

      const res = await request(app).get("/searchUserAdmin/123456");

      expect(res.status).toBe(200);
      expect(res.body[0].username).toBe("123456");
    });
  });

  describe("8. getAllUserToChat Method", () => {
    test("#TC033 - getAllUserToChat: Successfully retrieve users for chat", async () => {
      app = createAppWithAuth({ id: "current-user", isAdmin: false });
      await createUser({ username: "ChatUser1" });
      await createUser({ username: "ChatUser2" });

      const res = await request(app).get("/getAllUsersToChat");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    test("#TC034 - getAllUserToChat: No other users exist", async () => {
      app = createAppWithAuth({ id: "lonely-user", isAdmin: false });

      const res = await request(app).get("/getAllUsersToChat");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No users were found");
    });
  });

  describe("9. getUserToAddInGroupChat Method", () => {
    // Note: This test would require mocking Chat model or adjusting the test
    // based on your actual implementation. This is a simplified approach.

    test("#TC035 - getUserToAddInGroupChat: Non-existent chat ID", async () => {
      app = createAppWithAuth({ id: "current-user", isAdmin: false });
      const nonExistentChatId = new mongoose.Types.ObjectId();

      const res = await request(app).get(
        `/getUserToAddInGroupChat/${nonExistentChatId}`
      );

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Chat not found");
    });

    test("#TC036 - getUserToAddInGroupChat: Invalid chat ID format", async () => {
      app = createAppWithAuth({ id: "current-user", isAdmin: false });

      const res = await request(app).get("/getUserToAddInGroupChat/invalid-id");

      expect(res.status).toBe(500); // Should return error for invalid ObjectId
    });
  });
});
