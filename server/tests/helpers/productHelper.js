// tests/helpers/productHelper.js
const Product = require("../../models/productModel").default; // 👈 important fix

async function createProduct(overrides = {}) {
  const defaultData = {
    name: "Test Product",
    description: "A great product",
    price: 100,
    stock: 10,
    categories: ["shirt"],
    sizes: ["M"],
    colors: ["Red"],
    listingPhotoPaths: ["img.jpg"],
  };
  return await Product.create({ ...defaultData, ...overrides });
}

module.exports = { createProduct };
