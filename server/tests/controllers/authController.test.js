/**
 * @jest-environment node
 */
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

process.env.JWT_SECRET = "kaydi";
process.env.JWT_REFRESH_SECRET = "kaydi0210";

const {
  connect,
  closeDatabase,
  clearDatabase,
} = require("../setup/mongoMemoryServer");

const User = require("../../models/userModel").default;
const { createUser } = require("../helpers/userHelper"); // ✅ Import helper
const authController = require("../../controllers/authController");

const app = express();
app.use(express.json());
app.use(cookieParser());

// Bind routes
app.post("/auth/signup", authController.signUp);
app.post("/auth/signin", authController.signIn);
app.post("/auth/signout", authController.signOut);
app.post("/auth/refresh", authController.refreshToken);
app.post("/auth/reset-password/:token", authController.resetPassword); // TC016-TC018

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Auth Controller - Test", () => {
  test("#TC001 - sign up with valid credentials", async () => {
    const res = await request(app).post("/auth/signup").send({
      username: "testuser",
      email: "test@example.com",
      password: "TestPass123",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User registered successfully");

    const userInDb = await User.findOne({ email: "test@example.com" });
    expect(userInDb).not.toBeNull();
    expect(userInDb.username).toBe("testuser");
  });

  test("#TC002 - sign in with correct credentials", async () => {
    const hashed = bcrypt.hashSync("TestPass123", 10);

    await createUser({
      username: "testuser",
      email: "test@example.com",
      password: hashed,
    }); // ✅ Use helper

    const res = await request(app).post("/auth/signin").send({
      email: "test@example.com",
      password: "TestPass123",
    });

    // Debug print
    if (res.status !== 200) {
      console.error("❌ Response body:", res.body);
    }

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.body.username).toBe("testuser");
  });

  test("#TC003 - sign out user", async () => {
    const res = await request(app).post("/auth/signout");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User signed out successfully");
  });

  test("#TC004 - refresh token return new access token", async () => {
    const fakeUser = {
      id: "123abc",
      username: "testuser",
      isAdmin: false,
    };

    const refreshToken = jwt.sign(fakeUser, "refresh_secret", {
      expiresIn: "1d",
    });

    process.env.JWT_SECRET = "access_secret";
    process.env.JWT_REFRESH_SECRET = "refresh_secret";

    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Token refreshed successfully");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  // #TC005 - Missing email or password
  test("#TC005 - Sign up with email or password is missing", async () => {
    const res = await request(app).post("/auth/signup").send({
      username: "testuser",
      email: "",
      password: "",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("All fields are required");
  });

  // #TC006 - Username too short
  test("#TC006 - Sign up with username is too short", async () => {
    const res = await request(app).post("/auth/signup").send({
      username: "a",
      email: "short@example.com",
      password: "validpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Username must be between 2 and 50 characters"
    );
  });

  // #TC007 - Username too long
  test("#TC007 - Sign up with username is too long", async () => {
    const longName = "a".repeat(51);
    const res = await request(app).post("/auth/signup").send({
      username: longName,
      email: "longname@example.com",
      password: "validpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Username must be between 2 and 50 characters"
    );
  });

  // #TC008 - Password too short
  test("#TC008 - Sign up with password is too short", async () => {
    const res = await request(app).post("/auth/signup").send({
      username: "user1",
      email: "shortpass@example.com",
      password: "123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Password must be between 6 and 20 characters"
    );
  });

  // #TC009 - Password too long
  test("#TC009 - Sign up with password is too long", async () => {
    const longPassword = "a".repeat(21);
    const res = await request(app).post("/auth/signup").send({
      username: "user2",
      email: "longpass@example.com",
      password: longPassword,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Password must be between 6 and 20 characters"
    );
  });

  // #TC010 - Email already exists
  test("#TC010 - Sign up with email already exists", async () => {
    await User.create({
      username: "existinguser",
      email: "exist@example.com",
      password: "hashedpassword",
    });

    const res = await request(app).post("/auth/signup").send({
      username: "newuser",
      email: "exist@example.com",
      password: "validpassword",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email already exists");
  });
  // #TC011 - missing email or password
  test("#TC011 - Sign in with email or password is missing", async () => {
    const res = await request(app).post("/auth/signin").send({
      email: "",
      password: "",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("All fields are required");
  });

  // #TC012 - email not found
  test("#TC012 - Sign in with user is not exist", async () => {
    const res = await request(app).post("/auth/signin").send({
      email: "nonexistent@example.com",
      password: "anyPassword123",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("User not found");
  });

  // #TC013 - incorrect password
  test("#TC013 - Sign in with password is incorrect", async () => {
    await User.create({
      username: "wrongpassuser",
      email: "wrongpass@example.com",
      password: bcrypt.hashSync("correctPassword", 10),
    });

    const res = await request(app).post("/auth/signin").send({
      email: "wrongpass@example.com",
      password: "incorrectPassword",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid password");
  });

  // TC014 - Refresh token missing
  test("#TC014 - refresh token is missing", async () => {
    const res = await request(app).post("/auth/refresh"); // or .post depending on your route method

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Refresh token is missing");
  });

  // TC015 - Invalid refresh token
  test("#TC015 - refresh token is invalid", async () => {
    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", ["refresh_token=invalidtoken"]);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Invalid refresh token");
  });

  // TC016 - invalid token

  test("#TC016 - reset password with token is invalid or expired", async () => {
    const res = await request(app)
      .post("/auth/reset-password/invalidtoken123")
      .send({ newPassword: "NewSecurePass123" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Invalid token or expired");
  });

  // TC017 - valid token
  test("#TC017 -  reset password successfully with valid token", async () => {
    const plainToken = "resettoken123";
    const hashedToken = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");

    const user = await User.create({
      username: "resetuser",
      email: "reset@example.com",
      password: bcrypt.hashSync("oldpass", 10),
      resetPasswordToken: hashedToken,
      resetPasswordExpires: Date.now() + 3600000, // 1 hour later
    });

    const res = await request(app)
      .post(`/auth/reset-password/${plainToken}`)
      .send({ newPassword: "NewStrongPass123" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password reset successfully");

    const updatedUser = await User.findById(user._id);
    const isPasswordCorrect = bcrypt.compareSync(
      "NewStrongPass123",
      updatedUser.password
    );
    expect(isPasswordCorrect).toBe(true);
  });
  test("#TC018 - sign up with special characters in username", async () => {
    const res = await request(app).post("/auth/signup").send({
      username: "user!@#",
      email: "specialchar@example.com",
      password: "ValidPass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch("Not allowed special characters");
  });
  test("#TC019 - new password is same as old password", async () => {
    const plainToken = "sameoldtoken123";
    const hashedToken = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");

    const hashedPassword = bcrypt.hashSync("SameOldPassword123", 10);

    const user = await User.create({
      username: "sameuser",
      email: "same@example.com",
      password: hashedPassword,
      resetPasswordToken: hashedToken,
      resetPasswordExpires: Date.now() + 3600000, // valid for 1 hour
    });

    const res = await request(app)
      .post(`/auth/reset-password/${plainToken}`)
      .send({ newPassword: "SameOldPassword123" }); // same as old

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(
      /new password must be different from old password/i
    );
  });
  test("#TC020 - sign up with invalid email format", async () => {
    const res = await request(app).post("/auth/signup").send({
      username: "testuser",
      email: "invalid-email-format",
      password: "TestPass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid email format");

    const userInDb = await User.findOne({ email: "invalid-email-format" });
    expect(userInDb).toBeNull();
  });
});
