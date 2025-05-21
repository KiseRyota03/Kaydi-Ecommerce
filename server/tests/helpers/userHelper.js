const User = require("../../models/userModel").default;

async function createUser(overrides = {}) {
  const defaultData = {
    username: "testuser",
    email: "test@example.com",
    password: "hashedpassword",
    profilePic: "avatar.jpg",
    isAdmin: false,
  };
  return await User.create({ ...defaultData, ...overrides });
}

async function createAdminUser(overrides = {}) {
  const defaultData = {
    username: "adminuser",
    email: "admin@example.com",
    password: "hashedpassword",
    profilePic: "admin.jpg",
    isAdmin: true,
  };
  return await User.create({ ...defaultData, ...overrides });
}

module.exports = { createUser, createAdminUser };
