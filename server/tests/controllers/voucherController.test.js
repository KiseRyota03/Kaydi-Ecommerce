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
const voucherController = require("../../controllers/voucherController");
const {
  createVoucher,
  createMockCategory,
  createMockProduct,
} = require("../helpers/voucherHelper");

const createAppWithAuth = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });

  app.post("/vouchers/:userId", voucherController.createVoucher);
  app.get("/vouchers/:userId", voucherController.getAllVouchers);
  app.get(
    "/vouchers/detail/:userId/:voucherId",
    voucherController.getVoucherById
  );
  app.put("/vouchers/:userId/:voucherId", voucherController.updateVoucher);
  app.delete("/vouchers/:userId/:voucherId", voucherController.deleteVoucher);
  app.post("/vouchers/apply/:userId/:code", voucherController.applyVoucher);
  app.get(
    "/vouchers/by-products/:productIds",
    voucherController.getVoucherByProductIds
  );
  app.get("/vouchers/export/all", voucherController.exportVouchers);
  app.get("/vouchers/statistic/all", voucherController.getVoucherStatistic);

  return app;
};

let adminId;

beforeAll(async () => {
  await connect();
  adminId = new mongoose.Types.ObjectId();
});

afterEach(async () => await clearDatabase());

afterAll(async () => await closeDatabase());

describe("VoucherController Integration", () => {
  let app;

  beforeEach(() => {
    app = createAppWithAuth({ id: adminId.toString(), isAdmin: true });
  });

  test("#TC001- apply voucher with valid product", async () => {
    const product = await createMockProduct();
    await createVoucher({ applyProducts: [product._id] });

    const res = await request(app)
      .post(`/vouchers/apply/${adminId}/DISCOUNT10`)
      .send({ productIds: [product._id.toString()], categories: [] });

    expect(res.status).toBe(200);
  });

  test("#TC002 - should get all vouchers", async () => {
    await createVoucher({ code: "CODEX", discount: 15 });
    const res = await request(app).get(`/vouchers/${adminId}`);
    expect(res.status).toBe(200);
    expect(res.body.totalVouchers).toBe(1);
  });

  test("#TC003 - should update a voucher", async () => {
    const voucher = await createVoucher({ code: "UPDATE", discount: 5 });
    const res = await request(app)
      .put(`/vouchers/${adminId}/${voucher._id}`)
      .send({ code: "UPDATED", discount: 20 });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe("UPDATED");
  });

  test("#TC004 - should apply a voucher to valid products", async () => {
    const product = await Product.create({
      name: "Shirt",
      price: 100,
      stock: 10,
    });
    const voucher = await createVoucher({
      code: "DISCOUNT",
      applyProducts: [product._id],
    });
    const res = await request(app)
      .post(`/vouchers/apply/${adminId}/DISCOUNT`)
      .send({ productIds: [product._id.toString()], categories: [] });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("successfully");
  });

  test("#TC005 - should delete a voucher", async () => {
    const voucher = await createVoucher({ code: "DELETE" });
    const res = await request(app).delete(
      `/vouchers/${adminId}/${voucher._id}`
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("deleted successfully");
  });

  test("#TC006 - should return voucher statistic (most/least used)", async () => {
    await createVoucher({ code: "TOP1", usedCount: 5 });
    await createVoucher({ code: "LOW1", usedCount: 1 });
    const res = await request(app).get("/vouchers/statistic/all");
    expect(res.status).toBe(200);
    expect(res.body.mostUsed.code).toBe("TOP1");
    expect(res.body.leastUsed.code).toBe("LOW1");
  });

  // NEGATIVE TEST CASES

  test("#TC007 - create voucher - unauthorized user", async () => {
    const appNotAdmin = createAppWithAuth({
      id: "fake0idAdmin",
      isAdmin: false,
    });
    const res = await request(appNotAdmin)
      .post(`/vouchers/fakeOidAdmin`)
      .send({
        code: "DISCOUNT10",
        discount: 10,
        expiryDate: new Date(Date.now() + 86400000),
        usageLimit: 5,
        applyProducts: [],
        applyCategories: [],
      });
    expect(res.status).toBe(401);
    expect(res.body.message).toContain("You are not admin");
  });

  test("#TC008 - get all vouchers - unauthorized user", async () => {
    await createVoucher();
    const appNotAdmin = createAppWithAuth({ id: "fakeId", isAdmin: false });
    const res = await request(appNotAdmin).get(`/vouchers/fakeId`);
    expect(res.status).toBe(401);
    expect(res.body.message).toContain("You are not admin");
  });

  test("#TC009 - apply voucher with wrong product", async () => {
    const validProduct = await createMockProduct();
    await createVoucher({
      code: "MISMATCH",
      applyProducts: [validProduct._id],
    });
    const res = await request(app)
      .post(`/vouchers/apply/${adminId}/MISMATCH`)
      .send({
        productIds: [new mongoose.Types.ObjectId().toString()],
        categories: [],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("not applicable");
  });

  test("#TC010 - apply voucher - expired", async () => {
    const expiredDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // yesterday
    const voucher = await createVoucher({
      code: "EXPIRED",
      expiryDate: expiredDate,
    });
    const res = await request(app)
      .post(`/vouchers/apply/${adminId}/EXPIRED`)
      .send({ productIds: [], categories: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("expired");
  });

  test("#TC011 - apply voucher - usage limit exceeded", async () => {
    const voucher = await createVoucher({
      code: "LIMITED",
      usageLimit: 1,
      usedCount: 1,
    });
    const res = await request(app)
      .post(`/vouchers/apply/${adminId}/LIMITED`)
      .send({ productIds: [], categories: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("usage limit");
  });

  test("#TC012 - get voucher by ID - not found", async () => {
    const res = await request(app).get(
      `/vouchers/detail/${adminId}/000000000000000000000000`
    );
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Voucher not found");
  });

  test("#TC013 - delete voucher - not found", async () => {
    const res = await request(app).delete(
      `/vouchers/${adminId}/000000000000000000000000`
    );
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Voucher not found");
  });

  test("#TC014 - export vouchers - unauthorized", async () => {
    const appNotAdmin = createAppWithAuth({ id: "user", isAdmin: false });
    const res = await request(appNotAdmin).get("/vouchers/export/all");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("You are not allowed to export vouchers");
  });

  test("#TC015 - get statistic - unauthorized", async () => {
    const appNotAdmin = createAppWithAuth({ id: "user", isAdmin: false });
    const res = await request(appNotAdmin).get("/vouchers/statistic/all");
    expect(res.status).toBe(401);
    expect(res.body.message).toContain("not authorized");
  });

  test("#TC016 - create voucher with invalid discount (negative)", async () => {
    const res = await request(app)
      .post(`/vouchers/${adminId}`)
      .send({
        code: "NEGATIVE10",
        discount: -10,
        expiryDate: new Date(Date.now() + 86400000), // 1 day later
        usageLimit: 10,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch("Invalid Discount");
  });

  test("#TC017 - create voucher with invalid usageLimit (zero)", async () => {
    const res = await request(app)
      .post(`/vouchers/${adminId}`)
      .send({
        code: "ZERO_USAGE",
        discount: 10,
        expiryDate: new Date(Date.now() + 86400000),
        usageLimit: 0,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/usage limit must be greater than zero/i);
  });

  test("#TC018 - create voucher with duplicate code", async () => {
    await request(app)
      .post(`/vouchers/${adminId}`)
      .send({
        code: "DUPLICATE",
        discount: 10,
        expiryDate: new Date(Date.now() + 86400000),
        usageLimit: 5,
      });

    const res = await request(app)
      .post(`/vouchers/${adminId}`)
      .send({
        code: "DUPLICATE",
        discount: 15,
        expiryDate: new Date(Date.now() + 86400000),
        usageLimit: 10,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/i);
  });

  test("#TC019 - create voucher with invalid discount (exceed)", async () => {
    const res = await request(app)
      .post(`/vouchers/${adminId}`)
      .send({
        code: "PLUS101",
        discount: 101,
        expiryDate: new Date(Date.now() + 86400000), // 1 day later
        usageLimit: 10,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch("Invalid Discount");
  });
});
