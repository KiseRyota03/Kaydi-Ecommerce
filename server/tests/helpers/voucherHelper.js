// tests/helpers/voucherHelper.js
import Voucher from "../../models/voucherModel.js";
import Product from "../../models/productModel.js";
import Category from "../../models/categoryModel.js";
import mongoose from "mongoose";

export async function createMockProduct(overrides = {}) {
  const defaultProduct = {
    name: "Test Product",
    price: 100,
    stock: 10,
    ...overrides,
  };

  return await Product.create(defaultProduct);
}

export async function createMockCategory(overrides = {}) {
  const defaultCategory = {
    name: "Test Category",
    description: "Sample category",
    ...overrides,
  };

  return await Category.create(defaultCategory);
}

export async function createVoucher(overrides = {}) {
  const defaultVoucher = {
    code: "DISCOUNT10",
    discount: 10,
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    usageLimit: 5,
    usedCount: 0,
    applyProducts: [],
    applyCategories: [],
    status: "active",
  };

  const voucherData = { ...defaultVoucher, ...overrides };
  const voucher = new Voucher(voucherData);
  return await voucher.save();
}

export async function createMultipleVouchers(count = 3, overrides = {}) {
  const vouchers = [];
  for (let i = 0; i < count; i++) {
    const voucher = await createVoucher({
      code: `CODE${i}`,
      ...overrides,
    });
    vouchers.push(voucher);
  }
  return vouchers;
}

export async function createExpiredVoucher() {
  return await createVoucher({
    code: "EXPIRED",
    expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    status: "expired",
  });
}

export async function createUsedUpVoucher() {
  return await createVoucher({
    code: "USEDUP",
    usageLimit: 1,
    usedCount: 1,
  });
}
