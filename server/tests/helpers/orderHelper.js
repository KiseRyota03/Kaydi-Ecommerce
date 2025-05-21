const mongoose = require("mongoose");
const User = require("../../models/userModel").default;
const Product = require("../../models/productModel").default;
const Order = require("../../models/orderModel").default;

// // Create a user (admin by default)
// async function createUser(overrides = {}) {
//   const defaultData = {
//     username: "john_doe",
//     email: "john@example.com",
//     password: "hashedpassword",
//     isAdmin: true,
//     profilePic: "avatar.jpg",
//     phoneNumber: "0123456789",
//     gender: "male",
//   };
//   return await User.create({ ...defaultData, ...overrides });
// }

// // Create a product
// async function createProduct(overrides = {}) {
//   const defaultProduct = {
//     name: "Sample Product",
//     description: "This is a test product",
//     stock: 10,
//     price: 50000,
//     category: "testing",
//     color: "Red",
//     size: "M",
//     image: "sample.jpg",
//   };
//   return await Product.create({ ...defaultProduct, ...overrides });
// }

async function createOrderPayload(userId) {
  const product = await Product.create({
    name: "Test Product",
    price: 50000,
    stock: 10,
    color: "Blue",
    size: "M",
    description: "Sample description",
    image: "sample.jpg",
  });

  return {
    userId,
    receiverName: "John Doe",
    receiverPhone: "0123456789",
    receiverNote: "Leave at the door",
    products: [
      {
        productId: product._id,
        name: product.name,
        quantity: 1,
        price: product.price,
        color: product.color,
        size: product.size,
        image: product.image,
      },
    ],
    totalAmount: 50000,
    shippingAddress: "123 Main St",
    paymentMethod: "COD",
  };
}

async function createOrder(userId, overrides = {}) {
  const payload = await createOrderPayload(userId);
  return await Order.create({ ...payload, ...overrides });
}

module.exports = { createOrderPayload, createOrder };
