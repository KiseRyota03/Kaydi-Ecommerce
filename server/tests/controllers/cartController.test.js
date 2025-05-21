/**
 * @jest-environment node
 */
const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const app = express();

const {
  connect,
  closeDatabase,
  clearDatabase,
} = require("../setup/mongoMemoryServer");

const Cart = require("../../models/cartModel").default;
const cartController = require("../../controllers/cartController");
const { createProduct } = require("../helpers/productHelper");

// ✅ Generate a valid ObjectId to be used for testing
const userId = new mongoose.Types.ObjectId("682a952865eb470e47971738");

app.use(express.json());

// Fake auth middleware
app.use((req, res, next) => {
  req.user = { id: userId.toString() };
  next();
});

// Bind routes
app.post("/cart/add", cartController.addToCart);
app.post("/cart/remove", cartController.removeFromCart);
app.get("/cart/:userId", cartController.getUserCart);
app.put("/cart/update/:userId", cartController.updateUserCart);
app.post("/cart/items", cartController.getItemsInCart);
app.post("/cart/remove-items", cartController.removeItemsFromCart);

beforeAll(async () => {
  await connect();
  console.log("🧪 Test userId:", userId.toString());
});
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("CartController Integration", () => {
  // #TC001 - Add to cart
  test("#TC001- add new product to cart and verify DB state", async () => {
    const newProduct = await createProduct({
      _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
    });

    const payload = {
      userId: userId.toString(),
      productId: newProduct._id.toString(),
      quantity: 2,
      color: "Red",
      size: "L",
    };

    const res = await request(app).post("/cart/add").send(payload);
    if (res.status !== 200) {
      console.error("❌ Response:", res.body);
    }

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);

    const cartInDb = await Cart.findOne({ userId: userId });
    expect(cartInDb).not.toBeNull();
    expect(cartInDb.products[0].name).toBe("Test Product");
    expect(cartInDb.subtotal).toBe(200);
  });

  // #TC002 - Remove from cart
  test("#TC002 -  remove product from cart", async () => {
    const newProduct = await createProduct({ price: 50 });

    await request(app).post("/cart/add").send({
      userId: userId.toString(),
      productId: newProduct._id.toString(),
      quantity: 1,
      color: "Blue",
      size: "M",
    });

    const res = await request(app).post("/cart/remove").send({
      userId: userId.toString(),
      productId: newProduct._id.toString(),
      color: "Blue",
      size: "M",
    });

    expect(res.status).toBe(200);
    expect(res.body.cart.products).toHaveLength(0);

    const cartInDb = await Cart.findOne({ userId: userId });
    expect(cartInDb.products).toHaveLength(0);
  });

  // #TC003 - Get user cart
  test("#TC003 -  return cart for correct user", async () => {
    const newProduct = await createProduct({ price: 75 });

    await request(app).post("/cart/add").send({
      userId: userId.toString(),
      productId: newProduct._id.toString(),
      quantity: 1,
      color: "Black",
      size: "XL",
    });

    const res = await request(app).get(`/cart/${userId.toString()}`);
    expect(res.status).toBe(200);
    expect(res.body.cart.products).toHaveLength(1);
    expect(res.body.totalProducts).toBe(1);
  });

  // #TC004 - Update cart
  test("#TC004 - increase quantity of product in cart", async () => {
    const newProduct = await createProduct({ price: 40 });

    await request(app).post("/cart/add").send({
      userId: userId.toString(),
      productId: newProduct._id.toString(),
      quantity: 1,
      color: "White",
      size: "S",
    });

    const res = await request(app)
      .put(`/cart/update/${userId.toString()}`)
      .send({
        productId: newProduct._id.toString(),
        color: "White",
        size: "S",
        quantity: 2,
        actionType: "inc",
      });

    expect(res.status).toBe(200);
    expect(res.body.cart.products[0].quantity).toBe(3);
  });

  // #TC005 - Get items in cart
  test("#TC005 - return specific items in cart", async () => {
    const newProduct = await createProduct({ price: 60 });

    await request(app).post("/cart/add").send({
      userId: userId.toString(),
      productId: newProduct._id.toString(),
      quantity: 1,
      color: "Green",
      size: "M",
    });

    const res = await request(app)
      .post("/cart/items")
      .send({
        userId: userId.toString(),
        chooseItems: [
          {
            productId: newProduct._id.toString(),
            color: "Green",
            size: "M",
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  // #TC006 - Remove multiple items
  test("#TC006 - remove multiple items from cart", async () => {
    const p1 = await createProduct({ price: 10 });
    const p2 = await createProduct({ price: 20 });

    await request(app).post("/cart/add").send({
      userId: userId.toString(),
      productId: p1._id.toString(),
      quantity: 1,
      color: "A",
      size: "S",
    });

    await request(app).post("/cart/add").send({
      userId: userId.toString(),
      productId: p2._id.toString(),
      quantity: 1,
      color: "B",
      size: "M",
    });

    const res = await request(app)
      .post("/cart/remove-items")
      .send({
        userId: userId.toString(),
        productsRemove: [
          { productId: p1._id.toString(), color: "A", size: "S" },
          { productId: p2._id.toString(), color: "B", size: "M" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.cart.products).toHaveLength(0);
  });

  test("#TC007 - Add to cart - unauthorized user", async () => {
    const newProduct = await createProduct();

    const res = await request(app).post("/cart/add").send({
      userId: "fakeUserId123", // different from req.user.id
      productId: newProduct._id.toString(),
      quantity: 1,
      color: "Red",
      size: "M",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(
      "You are not allowed to add this product to cart"
    );
  });

  test("#TC008 - Add to cart - product not found", async () => {
    const res = await request(app).post("/cart/add").send({
      userId: userId.toString(),
      productId: new mongoose.Types.ObjectId().toString(),
      quantity: 1,
      color: "Red",
      size: "M",
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Product not found");
  });

  test("#TC009 - Remove from cart - cart not found", async () => {
    const res = await request(app).post("/cart/remove").send({
      userId: userId.toString(),
      productId: new mongoose.Types.ObjectId().toString(),
      color: "Blue",
      size: "L",
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Cart not found");
  });

  test("#TC010 - Remove from cart - product not found", async () => {
    await Cart.create({ userId: userId.toString(), products: [] });

    const res = await request(app).post("/cart/remove").send({
      userId: userId.toString(),
      productId: new mongoose.Types.ObjectId().toString(),
      color: "Red",
      size: "M",
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Product not found in cart");
  });

  test("#TC011 - Update cart - product not found", async () => {
    await Cart.create({ userId: userId.toString(), products: [] });

    const res = await request(app).put(`/cart/update/${userId}`).send({
      productId: new mongoose.Types.ObjectId().toString(),
      color: "Red",
      size: "M",
      quantity: 1,
      actionType: "inc",
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Product not found in cart");
  });

  test("#TC012 - Get items in cart - no items matched", async () => {
    await Cart.create({ userId: userId.toString(), products: [] });

    const res = await request(app)
      .post("/cart/items")
      .send({
        userId: userId.toString(),
        chooseItems: [
          {
            productId: new mongoose.Types.ObjectId().toString(),
            color: "Red",
            size: "M",
          },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("No items found in cart");
  });

  test("#TC013 - Remove multiple items - cart not found", async () => {
    const res = await request(app)
      .post("/cart/remove-items")
      .send({
        userId: userId.toString(),
        productsRemove: [
          {
            productId: new mongoose.Types.ObjectId().toString(),
            color: "Red",
            size: "M",
          },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Cart not found");
  });

  test("#TC014 - Remove multiple items - one product not found", async () => {
    await Cart.create({ userId: userId.toString(), products: [] });

    const res = await request(app)
      .post("/cart/remove-items")
      .send({
        userId: userId.toString(),
        productsRemove: [
          {
            productId: new mongoose.Types.ObjectId().toString(),
            color: "Red",
            size: "M",
          },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Product not found");
  });

  test("#TC015 - add to cart with quantity exceeding stock", async () => {
    const newProduct = await createProduct({
      stock: 5,
      price: 100,
      _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439012"),
    });

    const payload = {
      userId: userId.toString(),
      productId: newProduct._id.toString(),
      quantity: 10, // Exceeds available stock
      color: "Blue",
      size: "M",
    };

    const res = await request(app).post("/cart/add").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exceeds available stock/i);

    const cartInDb = await Cart.findOne({ userId });
    expect(cartInDb?.products?.length || 0).toBe(0);
  });

  test("#TC016 - add to cart with quantity = 0", async () => {
    const newProduct = await createProduct({
      stock: 10,
      price: 100,
      _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439013"),
    });

    const payload = {
      userId: userId.toString(),
      productId: newProduct._id.toString(),
      quantity: 0,
      color: "Green",
      size: "S",
    };

    const res = await request(app).post("/cart/add").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/quantity must be greater than zero/i);
  });

  test("#TC017 - add to cart with quantity = -1", async () => {
    const newProduct = await createProduct({
      stock: 10,
      price: 100,
      _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439014"),
    });

    const payload = {
      userId: userId.toString(),
      productId: newProduct._id.toString(),
      quantity: -1,
      color: "Black",
      size: "XL",
    };

    const res = await request(app).post("/cart/add").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/quantity must be greater than zero/i);
  });
});
