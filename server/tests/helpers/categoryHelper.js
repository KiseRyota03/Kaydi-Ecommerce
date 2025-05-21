const Category = require("../../models/categoryModel").default;

async function createCategory(overrides = {}) {
  const defaultData = {
    name: "default-category",
    title: "Default Title",
    description: ["Default description"],
    heroImage: "default.jpg",
  };
  return await Category.create({ ...defaultData, ...overrides });
}

module.exports = { createCategory };
