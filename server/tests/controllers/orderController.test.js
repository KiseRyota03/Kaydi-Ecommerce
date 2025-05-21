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

const orderController = require("../../controllers/orderController");
const Order = require("../../models/orderModel").default;
const Product = require("../../models/productModel").default;
const User = require("../../models/userModel").default;

// Setup express apps for different user roles
const regularUserApp = express();
regularUserApp.use(express.json());
const adminUserApp = express();
adminUserApp.use(express.json());

// User IDs for testing
const regularUserId = new mongoose.Types.ObjectId();
const adminUserId = new mongoose.Types.ObjectId();
const strangerUserId = new mongoose.Types.ObjectId();

// Middleware to simulate authentication with different user roles
regularUserApp.use((req, res, next) => {
  req.user = { id: regularUserId.toString(), isAdmin: false };
  next();
});

adminUserApp.use((req, res, next) => {
  req.user = { id: adminUserId.toString(), isAdmin: true };
  next();
});

// Setup routes for regular user
regularUserApp.post("/orders", orderController.createOrder);
regularUserApp.delete(
  "/orders/cancel/:userId/:orderId",
  orderController.cancelOrder
);
regularUserApp.get("/orders/user/:userId", orderController.getUserOrder);
regularUserApp.get("/orders/id/:orderId", orderController.getOrderById);
regularUserApp.post("/orders/stripe", orderController.paymentWithStripe);
regularUserApp.put(
  "/orders/payment-check/:orderId",
  orderController.updateOrderPaymentCheck
);

// Setup routes for admin user
adminUserApp.get("/orders/all", orderController.getAllOrder);
adminUserApp.put("/orders/edit/:orderId", orderController.editOrder);
adminUserApp.get("/orders/user/:userId", orderController.getUserOrder);
adminUserApp.get("/orders/per-day", orderController.getTotalAmountPerDay);
adminUserApp.get("/orders/per-month", orderController.getTotalAmountPerMonth);
adminUserApp.get("/orders/customers", orderController.getAllOrdersOfCustomer);
adminUserApp.get("/orders/export", orderController.exportOrders);
adminUserApp.get("/orders/status", orderController.getAllOrderStatus);
adminUserApp.get("/orders/revenue", orderController.getOrderTotalRevenue);
adminUserApp.get("/orders/search/:searchKey", orderController.searchOrderAdmin);

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

// Helper function to create a test order
async function createTestOrder(userId, productId, status = "pending") {
  return await Order.create({
    userId,
    receiverName: "Test User",
    receiverPhone: "0123456789",
    receiverNote: "Test note",
    products: [
      {
        productId,
        name: "Test Product",
        quantity: 1,
        price: 100000,
        color: "Black",
        size: "M",
        image: "test.jpg",
      },
    ],
    totalAmount: 100000,
    shippingAddress: "123 Test Street, City, Country",
    paymentMethod: "COD",
    status,
  });
}

// Helper function to create a test product
async function createTestProduct(
  name = "Test Product",
  price = 100000,
  stock = 10
) {
  return await Product.create({
    name,
    price,
    stock,
  });
}

describe("OrderController", () => {
  // 1. Order Creation Tests
  describe("Order Creation", () => {
    test("#TC001 - create order successfully with COD", async () => {
      const product = await createTestProduct();

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Alice",
        receiverPhone: "0123456789",
        receiverNote: "Leave at door",
        products: [
          {
            productId: product._id.toString(),
            name: "Test Product",
            quantity: 2,
            price: 100000,
            color: "Red",
            size: "M",
            image: "image.jpg",
          },
        ],
        totalAmount: 200000,
        shippingAddress: "123 Main St, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(200);
      expect(res.body.receiverName).toBe("Alice");

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.stock).toBe(8); // 10 - 2 = 8
    });

    test("#TC002 - create order with insufficient stock", async () => {
      const product = await Product.create({
        name: "Limited Product",
        price: 50000,
        stock: 1,
      });

      const res = await request(regularUserApp)
        .post("/orders")
        .send({
          userId: regularUserId.toString(),
          receiverName: "Bob",
          receiverPhone: "0987654321",
          receiverNote: "",
          products: [
            {
              productId: product._id.toString(),
              name: "Limited Product",
              quantity: 2,
              price: 50000,
              color: "Blue",
              size: "L",
              image: "image.jpg",
            },
          ],
          totalAmount: 100000,
          shippingAddress: "456 Market St, City, Country",
          paymentMethod: "COD",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Not enough stock");
    });

    test("#TC003 - create order with non-existing product", async () => {
      const res = await request(regularUserApp)
        .post("/orders")
        .send({
          userId: regularUserId.toString(),
          receiverName: "Charlie",
          receiverPhone: "0909090909",
          receiverNote: "",
          products: [
            {
              productId: new mongoose.Types.ObjectId().toString(),
              name: "Ghost Product",
              quantity: 1,
              price: 100000,
              color: "White",
              size: "S",
              image: "ghost.jpg",
            },
          ],
          totalAmount: 100000,
          shippingAddress: "789 Ghost Rd, City, Country",
          paymentMethod: "COD",
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Product not found");
    });

    test("#TC004 - create order with unsupported payment method", async () => {
      const product = await createTestProduct("Stripe Product", 120000);

      const res = await request(regularUserApp)
        .post("/orders")
        .send({
          userId: regularUserId.toString(),
          receiverName: "Stripe User",
          receiverPhone: "0111111111",
          receiverNote: "",
          products: [
            {
              productId: product._id.toString(),
              name: "Stripe Product",
              quantity: 1,
              price: 120000,
              color: "Black",
              size: "XL",
              image: "stripe.jpg",
            },
          ],
          totalAmount: 120000,
          shippingAddress: "123 Stripe Blvd, City, Country",
          paymentMethod: "Stripe", // Non-COD method
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Other function are not supported");
    });

    test("#TC005 - unauthenticated user attempt", async () => {
      // Create app without authentication
      const noAuthApp = express();
      noAuthApp.use(express.json());
      noAuthApp.use((req, res, next) => {
        req.user = null; // No authentication
        next();
      });
      noAuthApp.post("/orders", orderController.createOrder);

      const res = await request(noAuthApp).post("/orders").send({
        userId: regularUserId.toString(),
        receiverName: "Anon",
        receiverPhone: "0000000000",
        products: [],
        totalAmount: 0,
        shippingAddress: "Nowhere",
        paymentMethod: "COD",
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not logged in");
    });

    test("#TC009 - invalid phone number length", async () => {
      const product = await createTestProduct();

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Alice",
        receiverPhone: "01234", // Too short
        receiverNote: "Leave at door",
        products: [
          {
            productId: product._id.toString(),
            name: "Test Product",
            quantity: 1,
            price: 100000,
            color: "Red",
            size: "M",
            image: "image.jpg",
          },
        ],
        totalAmount: 100000,
        shippingAddress: "123 Main St, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid phone number length/i);
    });

    test("#TC010 - non-numeric phone number", async () => {
      const product = await createTestProduct();

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Bob",
        receiverPhone: "01234ABC89", // Contains letters
        receiverNote: "Urgent",
        products: [
          {
            productId: product._id.toString(),
            name: "Test Product",
            quantity: 1,
            price: 100000,
            color: "Blue",
            size: "L",
            image: "image.jpg",
          },
        ],
        totalAmount: 100000,
        shippingAddress: "456 Main St, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(
        /Phone number contains digital numbers only/i
      );
    });

    test("#TC011 - create order with empty products array", async () => {
      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Empty Order",
        receiverPhone: "0123456789",
        receiverNote: "",
        products: [], // Empty array
        totalAmount: 0,
        shippingAddress: "123 Empty Street, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Products array cannot be empty");
    });

    test("#TC012 - create order with negative product quantity", async () => {
      const product = await createTestProduct();

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Negative Order",
        receiverPhone: "0123456789",
        receiverNote: "",
        products: [
          {
            productId: product._id.toString(),
            name: "Test Product",
            quantity: -1, // Negative quantity
            price: 100000,
            color: "Black",
            size: "M",
            image: "negative.jpg",
          },
        ],
        totalAmount: 100000,
        shippingAddress: "123 Negative Street, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Product quantity must be positive");
    });

    test("#TC013 - create order with mismatched total amount", async () => {
      const product = await createTestProduct();

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Mismatch Order",
        receiverPhone: "0123456789",
        receiverNote: "",
        products: [
          {
            productId: product._id.toString(),
            name: "Test Product",
            quantity: 2,
            price: 100000, // 2 * 100000 = 200000
            color: "Black",
            size: "M",
            image: "mismatch.jpg",
          },
        ],
        totalAmount: 150000, // Doesn't match the product price * quantity
        shippingAddress: "123 Mismatch Street, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "Total amount does not match product prices"
      );
    });
  });

  // 2. Order Cancellation Tests
  describe("Order Cancellation", () => {
    test("#TC014 - cancel order successfully", async () => {
      const product = await createTestProduct();
      const order = await createTestOrder(regularUserId, product._id);

      const res = await request(regularUserApp).delete(
        `/orders/cancel/${regularUserId}/${order._id}`
      );
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Order canceled successfully");

      // Verify order no longer exists
      const deletedOrder = await Order.findById(order._id);
      expect(deletedOrder).toBe(null);
    });

    test("#TC015 - cannot cancel another user's order", async () => {
      const product = await createTestProduct();
      const order = await createTestOrder(strangerUserId, product._id);

      const res = await request(regularUserApp).delete(
        `/orders/cancel/${regularUserId}/${order._id}`
      );
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        "You are not authorized to cancel this order"
      );
    });

    test("#TC016 - cannot cancel order that is already processing", async () => {
      const product = await createTestProduct();
      const order = await createTestOrder(
        regularUserId,
        product._id,
        "processing"
      );

      const res = await request(regularUserApp).delete(
        `/orders/cancel/${regularUserId}/${order._id}`
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "Order is in processing, can not be cancel!"
      );
    });

    test("#TC017 - cancel non-existent order", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const res = await request(regularUserApp).delete(
        `/orders/cancel/${regularUserId}/${nonExistentId}`
      );
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Order not found");
    });
  });

  // 3. Order Retrieval Tests
  describe("User Order Retrieval", () => {
    test("#TC018 - get user orders successfully", async () => {
      const product = await createTestProduct();

      // Create multiple orders for the user
      await createTestOrder(regularUserId, product._id);
      await createTestOrder(regularUserId, product._id);

      const res = await request(regularUserApp).get(
        `/orders/user/${regularUserId}`
      );
      expect(res.status).toBe(200);
      expect(res.body.totalOrders).toBe(2);
      expect(res.body.findUserOrder.length).toBe(2);
    });

    // test("#TC019 - get user orders with pagination", async () => {
    //   const product = await createTestProduct();

    //   // Create multiple orders for the user
    //   for (let i = 0; i < 15; i++) {
    //     await createTestOrder(regularUserId, product._id);
    //   }

    //   // Test first page (default limit is 10)
    //   const res1 = await request(regularUserApp).get(
    //     `/orders/user/${regularUserId}`
    //   );
    //   expect(res1.status).toBe(200);
    //   expect(res1.body.totalOrders).toBe(15);
    //   expect(res1.body.currentPage).toBe(1);
    //   expect(res1.body.totalPages).toBe(2);
    //   expect(res1.body.findUserOrder.length).toBe(10);

    //   // Test second page
    //   const res2 = await request(regularUserApp).get(
    //     `/orders/user/${regularUserId}?page=2`
    //   );
    //   expect(res2.status).toBe(200);
    //   expect(res2.body.currentPage).toBe(2);
    //   expect(res2.body.findUserOrder.length).toBe(5);
    // });

    test("#TC020 - get single order by ID", async () => {
      const product = await createTestProduct();
      const order = await createTestOrder(regularUserId, product._id);

      const res = await request(regularUserApp).get(`/orders/id/${order._id}`);
      expect(res.status).toBe(200);
      expect(res.body._id).toBe(order._id.toString());
      expect(res.body.receiverName).toBe("Test User");
    });

    test("#TC021 - order not found when getting by ID", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const res = await request(regularUserApp).get(
        `/orders/id/${nonExistentId}`
      );
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Order not found");
    });

    test("#TC006 - get user orders with no orders", async () => {
      const res = await request(regularUserApp).get(
        `/orders/user/${regularUserId}`
      );
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No order found for this user");
    });
  });

  // 4. Payment Tests
  describe("Payment Operations", () => {
    test("#TC022 - payment with Stripe - reject COD method", async () => {
      const product = await createTestProduct();

      const orderData = {
        userId: regularUserId.toString(),
        receiverName: "Stripe User",
        receiverPhone: "0123456789",
        receiverNote: "",
        products: [
          {
            productId: product._id.toString(),
            name: "Stripe Product",
            quantity: 1,
            price: 150000,
            color: "Black",
            size: "M",
            image: "stripe.jpg",
          },
        ],
        totalAmount: 150000,
        shippingAddress: "123 Stripe Street, City, Country",
        paymentMethod: "COD", // Attempting to use COD with Stripe
      };

      const res = await request(regularUserApp)
        .post("/orders/stripe")
        .send(orderData);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe(
        "This method does not need to pay by Stripe"
      );
    });

    test("#TC023 - update order payment check", async () => {
      const product = await createTestProduct();

      const order = await Order.create({
        userId: regularUserId,
        receiverName: "Payment User",
        receiverPhone: "0123456789",
        products: [
          {
            productId: product._id,
            name: "Payment Product",
            quantity: 1,
            price: 150000,
            color: "Black",
            size: "M",
            image: "payment.jpg",
          },
        ],
        totalAmount: 150000,
        shippingAddress: "123 Payment Street, City, Country",
        paymentMethod: "Stripe",
        paymentCheck: false,
      });

      const res = await request(regularUserApp).put(
        `/orders/payment-check/${order._id}`
      );
      expect(res.status).toBe(200);
      expect(res.body.paymentCheck).toBe(true);
    });

    test("#TC008 - update payment check - order not found", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const res = await request(regularUserApp).put(
        `/orders/payment-check/${nonExistentId}`
      );
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Order not found");
    });
  });

  // 5. Admin Order Management Tests
  describe("Admin Order Management", () => {
    test("#TC024 - get all orders as admin", async () => {
      const product = await createTestProduct();

      // Create orders for testing
      await createTestOrder(regularUserId, product._id);
      await createTestOrder(adminUserId, product._id);

      const res = await request(adminUserApp).get("/orders/all");
      expect(res.status).toBe(200);
      expect(res.body.numberOfOrder).toBe(2);
      expect(res.body.findOrder.length).toBe(2);
      expect(res.body.todayOrder).toBeDefined();
      expect(res.body.lastWeekOrder).toBeDefined();
      expect(res.body.lastMonthOrder).toBeDefined();
    });

    test("#TC025 - edit order as admin - update receiver details", async () => {
      const product = await createTestProduct();
      const order = await createTestOrder(regularUserId, product._id);

      const updateData = {
        receiverName: "Updated User",
        receiverPhone: "0987654321",
      };

      const res = await request(adminUserApp)
        .put(`/orders/edit/${order._id}`)
        .send(updateData);
      expect(res.status).toBe(200);
      expect(res.body.receiverName).toBe("Updated User");
      expect(res.body.receiverPhone).toBe("0987654321");
    });

    test("#TC026 - edit order status to processing", async () => {
      const product = await createTestProduct();
      const order = await createTestOrder(regularUserId, product._id);

      const updateData = {
        status: "processing",
      };

      const res = await request(adminUserApp)
        .put(`/orders/edit/${order._id}`)
        .send(updateData);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("processing");
      expect(res.body.processingTime).toBeDefined();
    });

    test("#TC027 - edit order status to shipped", async () => {
      const product = await createTestProduct();
      const order = await createTestOrder(regularUserId, product._id);

      const updateData = {
        status: "shipped",
      };

      const res = await request(adminUserApp)
        .put(`/orders/edit/${order._id}`)
        .send(updateData);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("shipped");
      expect(res.body.shippedTime).toBeDefined();
    });

    test("#TC028 - edit order status to delivered", async () => {
      const product = await createTestProduct();
      const order = await createTestOrder(regularUserId, product._id);

      const updateData = {
        status: "delivered",
      };

      const res = await request(adminUserApp)
        .put(`/orders/edit/${order._id}`)
        .send(updateData);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("delivered");
      expect(res.body.deliveredTime).toBeDefined();
    });

    test("#TC029 - edit non-existent order", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const updateData = {
        receiverName: "Non-existent Order",
        status: "processing",
      };

      const res = await request(adminUserApp)
        .put(`/orders/edit/${nonExistentId}`)
        .send(updateData);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Order not found");
    });

    test("#TC030 - regular user attempting to edit order", async () => {
      const product = await createTestProduct();
      const order = await createTestOrder(regularUserId, product._id);

      const updateData = {
        status: "processing",
      };

      // Using regularUserApp to attempt an admin action
      const res = await request(regularUserApp)
        .put(`/orders/edit/${order._id}`)
        .send(updateData);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not admin to edit this order");
    });

    test("#TC031 - regular user attempting to get all orders", async () => {
      // Using regularUserApp to attempt an admin action
      const res = await request(regularUserApp).get("/orders/all");
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not admin to do this action");
    });
  });

  // 6. Admin Analytics Tests
  describe("Admin Analytics", () => {
    test("#TC032 - get total amount per day", async () => {
      const product = await createTestProduct();

      // Create orders for testing
      await createTestOrder(regularUserId, product._id);
      await createTestOrder(adminUserId, product._id);

      const res = await request(adminUserApp).get("/orders/per-day");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should have data for today
      expect(res.body.length).toBeGreaterThan(0);
    });

    test("#TC033 - get total amount per month", async () => {
      const product = await createTestProduct();

      // Create orders for testing
      await createTestOrder(regularUserId, product._id);
      await createTestOrder(adminUserId, product._id);

      const res = await request(adminUserApp).get("/orders/per-month");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should have data for the current month
      expect(res.body.length).toBeGreaterThan(0);
    });

    test("#TC034 - get all order statuses", async () => {
      const product = await createTestProduct();

      // Create orders with different statuses
      await createTestOrder(regularUserId, product._id, "pending");
      await createTestOrder(regularUserId, product._id, "processing");
      await createTestOrder(regularUserId, product._id, "shipped");
      await createTestOrder(regularUserId, product._id, "delivered");

      const res = await request(adminUserApp).get("/orders/status");
      expect(res.status).toBe(200);
      expect(res.body.pending).toBe(1);
      expect(res.body.processing).toBe(1);
      expect(res.body.shipped).toBe(1);
      expect(res.body.delivered).toBe(1);
    });

    test("#TC035 - get order total revenue", async () => {
      const product = await createTestProduct();

      // Create orders for testing
      await createTestOrder(regularUserId, product._id);
      await createTestOrder(adminUserId, product._id);

      const res = await request(adminUserApp).get("/orders/revenue");
      expect(res.status).toBe(200);
      expect(res.body.totalRevenue).toBe(200000); // 2 orders x 100000
      expect(res.body.thisMonthRevenue).toBe(200000);
    });

    test("#TC036 - regular user attempting to get analytics", async () => {
      // Using regularUserApp to attempt an admin action
      const res = await request(regularUserApp).get("/orders/revenue");
      expect(res.status).toBe(401);
      expect(res.body.message).toBe(
        "You are not authorized to get order total revenue"
      );
    });
  });

  // 7. Admin Search Tests
  describe("Admin Search Functionality", () => {
    test("#TC037 - search orders by receiver name", async () => {
      const product = await createTestProduct();

      // Create an order with a specific receiver name
      await Order.create({
        userId: regularUserId,
        receiverName: "Searchable User",
        receiverPhone: "0123456789",
        products: [
          {
            productId: product._id,
            name: "Search Product",
            quantity: 1,
            price: 150000,
            color: "Black",
            size: "M",
            image: "search.jpg",
          },
        ],
        totalAmount: 150000,
        shippingAddress: "123 Search Street, City, Country",
        paymentMethod: "COD",
      });

      const res = await request(adminUserApp).get("/orders/search/Searchable");
      expect(res.status).toBe(200);
      expect(res.body.findOrder.length).toBe(1);
      expect(res.body.findOrder[0].receiverName).toBe("Searchable User");
    });

    test("#TC038 - search orders by ID", async () => {
      const product = await createTestProduct();

      // Create an order
      const order = await createTestOrder(regularUserId, product._id);

      const res = await request(adminUserApp).get(
        `/orders/search/${order._id}`
      );
      expect(res.status).toBe(200);
      expect(res.body.findOrder.length).toBe(1);
      expect(res.body.findOrder[0]._id).toBe(order._id.toString());
    });

    test("#TC039 - search orders with no results", async () => {
      const res = await request(adminUserApp).get(
        "/orders/search/NonExistentOrder"
      );
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("No order founded");
    });

    test("#TC040 - regular user attempting to search orders", async () => {
      // Create separate route for regular user
      const searchApp = express();
      searchApp.use(express.json());
      searchApp.use((req, res, next) => {
        req.user = { id: regularUserId.toString(), isAdmin: false };
        next();
      });
      searchApp.get(
        "/orders/search/:searchKey",
        orderController.searchOrderAdmin
      );

      const res = await request(searchApp).get("/orders/search/test");
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("You are not admin to search orders");
    });
  });

  // 8. Edge Cases and Boundaries
  describe("Edge Cases and Boundaries", () => {
    test("#TC041 - create order with extremely long receiver note", async () => {
      const product = await createTestProduct();

      // Create a very long note (over 500 characters)
      const longNote = "A".repeat(501);

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Note Order",
        receiverPhone: "0123456789",
        receiverNote: longNote,
        products: [
          {
            productId: product._id.toString(),
            name: "Test Product",
            quantity: 1,
            price: 100000,
            color: "Black",
            size: "M",
            image: "note.jpg",
          },
        ],
        totalAmount: 100000,
        shippingAddress: "123 Note Street, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "Receiver note is too long (max 500 characters)"
      );
    });

    test("#TC042 - create order with extremely short shipping address", async () => {
      const product = await createTestProduct();

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Address Order",
        receiverPhone: "0123456789",
        receiverNote: "",
        products: [
          {
            productId: product._id.toString(),
            name: "Test Product",
            quantity: 1,
            price: 100000,
            color: "Black",
            size: "M",
            image: "address.jpg",
          },
        ],
        totalAmount: 100000,
        shippingAddress: "123", // Too short address
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "Shipping address is too short (min 10 characters)"
      );
    });

    test("#TC043 - create order with empty receiver name", async () => {
      const product = await createTestProduct();

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "", // Empty receiver name
        receiverPhone: "0123456789",
        receiverNote: "",
        products: [
          {
            productId: product._id.toString(),
            name: "Test Product",
            quantity: 1,
            price: 100000,
            color: "Black",
            size: "M",
            image: "empty.jpg",
          },
        ],
        totalAmount: 100000,
        shippingAddress: "123 Empty Name Street, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Receiver name is required");
    });

    test("#TC044 - create order with empty shipping address", async () => {
      const product = await createTestProduct();

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Empty Address Order",
        receiverPhone: "0123456789",
        receiverNote: "",
        products: [
          {
            productId: product._id.toString(),
            name: "Test Product",
            quantity: 1,
            price: 100000,
            color: "Black",
            size: "M",
            image: "empty.jpg",
          },
        ],
        totalAmount: 100000,
        shippingAddress: "", // Empty shipping address
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Shipping address is required");
    });

    test("#TC045 - create order with extremely large quantity", async () => {
      const product = await createTestProduct("Bulk Product", 1000, 10000);

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Bulk Order",
        receiverPhone: "0123456789",
        receiverNote: "",
        products: [
          {
            productId: product._id.toString(),
            name: "Bulk Product",
            quantity: 9999, // Very large quantity but within stock
            price: 1000,
            color: "Black",
            size: "M",
            image: "bulk.jpg",
          },
        ],
        totalAmount: 9999000, // 9999 * 1000
        shippingAddress: "123 Bulk Street, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(200);

      // Verify stock was reduced correctly
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.stock).toBe(1); // 10000 - 9999
    });
  });

  // 9. Performance Tests
  describe("Performance and Large Data Tests", () => {
    test("#TC046 - create order with many products", async () => {
      // Create 10 products
      const products = [];
      for (let i = 0; i < 10; i++) {
        products.push(
          await createTestProduct(`Multi Product ${i}`, 10000 * (i + 1), 20)
        );
      }

      // Create order with all 10 products
      const orderProducts = products.map((product, index) => ({
        productId: product._id.toString(),
        name: product.name,
        quantity: index + 1, // Different quantities
        price: product.price,
        color: "Black",
        size: "M",
        image: `multi${index}.jpg`,
      }));

      // Calculate total amount
      const totalAmount = orderProducts.reduce(
        (sum, product) => sum + product.price * product.quantity,
        0
      );

      const orderPayload = {
        userId: regularUserId.toString(),
        receiverName: "Multi Products Order",
        receiverPhone: "0123456789",
        receiverNote: "",
        products: orderProducts,
        totalAmount,
        shippingAddress: "123 Multi Products Street, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBe(10);
      expect(res.body.totalAmount).toBe(totalAmount);
    });

    test("#TC047 - get all orders with large dataset and pagination", async () => {
      const product = await createTestProduct();

      // Create 20 orders
      for (let i = 0; i < 20; i++) {
        await createTestOrder(regularUserId, product._id);
      }

      // Test with different page sizes
      const res1 = await request(adminUserApp).get("/orders/all?limit=5");
      expect(res1.status).toBe(200);
      expect(res1.body.numberOfOrder).toBe(20);
      expect(res1.body.findOrder.length).toBe(5);
      expect(res1.body.totalPages).toBe(4);

      // Test with different page
      const res2 = await request(adminUserApp).get(
        "/orders/all?page=2&limit=10"
      );
      expect(res2.status).toBe(200);
      expect(res2.body.currentPage).toBe(2);
      expect(res2.body.findOrder.length).toBe(10);
    });
  });

  // 10. Security Tests
  describe("Security Tests", () => {
    test("#TC048 - attempt to create order as another user", async () => {
      const product = await createTestProduct();

      const orderPayload = {
        userId: strangerUserId.toString(), // Trying to create an order for another user
        receiverName: "Security Order",
        receiverPhone: "0123456789",
        receiverNote: "",
        products: [
          {
            productId: product._id.toString(),
            name: "Security Product",
            quantity: 1,
            price: 100000,
            color: "Black",
            size: "M",
            image: "security.jpg",
          },
        ],
        totalAmount: 100000,
        shippingAddress: "123 Security Street, City, Country",
        paymentMethod: "COD",
      };

      const res = await request(regularUserApp)
        .post("/orders")
        .send(orderPayload);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        "You cannot create an order for another user"
      );
    });

    test("#TC049 - attempt to get another user's orders", async () => {
      const product = await createTestProduct();

      // Create an order for the other user
      await createTestOrder(strangerUserId, product._id);

      // Try to access the other user's orders as a regular user
      const res = await request(regularUserApp).get(
        `/orders/user/${strangerUserId}`
      );
      expect(res.status).toBe(401);
      expect(res.body.message).toBe(
        "You are not authorized to get this user order"
      );
    });

    test("#TC050 - SQL injection attempt in search", async () => {
      // Attempt a simple SQL injection in the search parameter
      const res = await request(adminUserApp).get(
        "/orders/search/'; DROP TABLE orders; --"
      );
      expect(res.status).toBe(200);
      // The search should handle this safely (mongoose protects against this)
      expect(res.body.message).toBe("No order founded");

      // Verify orders collection is intact by creating a test order
      const product = await createTestProduct();
      const order = await createTestOrder(regularUserId, product._id);
      expect(order).not.toBe(null);
    });
  });
});
