import Voucher from "../models/voucherModel.js";
import ExcelJS from "exceljs";

export const createVoucher = async (req, res, next) => {
  const userId = req.params.userId;
  const {
    code,
    discount,
    expiryDate,
    usageLimit,
    applyProducts,
    applyCategories,
    // applyUserIds,
  } = req.body;
  if (req.user.id !== userId) {
    return res
      .status(401)
      .json({ message: "You are not admin to perform this action" });
  }
  try {
    const newVoucher = new Voucher({
      code,
      discount,
      expiryDate,
      usageLimit,
      applyProducts,
      applyCategories,
      // applyUserIds,
    });

    await newVoucher.save();
    res.status(201).json(newVoucher);
  } catch (error) {
    next(error);
  }
};

export const getAllVouchers = async (req, res, next) => {
  const userId = req.params.userId;
  if (req.user.id !== userId || !req.user.isAdmin) {
    return res.status(401).json({ message: "You are not admin" });
  }
  try {
    const vouchers = await Voucher.find();
    if (vouchers.length === 0) {
      return res.status(404).json({ message: "No vouchers found" });
    }
    const now = new Date();

    const oneMonthAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate()
    );

    const oneWeekAgo = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 7
    );

    const lastWeekVoucher = await Voucher.find({
      createdAt: { $gte: oneWeekAgo },
    });

    const lastMonthVoucher = await Voucher.find({
      createdAt: { $gte: oneMonthAgo },
    });

    res.status(200).json({
      totalVouchers: vouchers.length,
      lastWeekVouchersCount: lastWeekVoucher.length,
      lastWeekVouchers: lastWeekVoucher,
      lastMonthVouchersCount: lastMonthVoucher.length,
      lastMonthVouchers: lastMonthVoucher,
      vouchers: vouchers,
    });
  } catch (error) {
    next(error);
  }
};

export const getVoucherById = async (req, res, next) => {
  const { userId, voucherId } = req.params;
  if (req.user.id !== userId) {
    return res
      .status(401)
      .json({ message: "You are not admin to perform this action" });
  }
  try {
    const findVoucher = await Voucher.findById(voucherId);
    if (!findVoucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }
    res.status(200).json(findVoucher);
  } catch (error) {
    next(error);
  }
};

export const updateVoucher = async (req, res, next) => {
  const { userId, voucherId } = req.params;
  const {
    code,
    discount,
    expiryDate,
    usageLimit,
    applyProducts,
    applyCategories,
    // applyUserIds,
    status,
  } = req.body;
  if (req.user.id !== userId) {
    return res
      .status(401)
      .json({ message: "You are not admin to perform this action" });
  }
  try {
    const updatedVoucher = await Voucher.findByIdAndUpdate(
      voucherId,
      {
        $set: {
          code,
          discount,
          expiryDate,
          usageLimit,
          applyProducts,
          applyCategories,
          // applyUserIds,
          status,
        },
      },
      { new: true }
    );
    res.status(200).json(updatedVoucher);
  } catch (error) {
    next(error);
  }
};

export const deleteVoucher = async (req, res, next) => {
  const { userId, voucherId } = req.params;
  if (req.user.id !== userId) {
    return res
      .status(401)
      .json({ message: "You are not admin to perform this action" });
  }
  try {
    const deletedVoucher = await Voucher.findByIdAndDelete(voucherId);
    if (!deletedVoucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }
    return res
      .status(200)
      .json({ message: "Voucher has been deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const applyVoucher = async (req, res, next) => {
  const { userId, code } = req.params;
  const { productIds, categories } = req.body;

  try {
    const voucher = await Voucher.findOne({ code });
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    if (voucher.usedCount >= voucher.usageLimit) {
      voucher.status = "expired";
      return res.status(400).json({ message: "Voucher usage limit reached" });
    }

    if (voucher.expiryDate < new Date()) {
      voucher.status = "expired";
      await voucher.save();
      return res.status(400).json({ message: "Voucher has expired" });
    }

    if (voucher.applyProducts.length) {
      // return an array of product ID
      const applyProductIds = voucher.applyProducts.map((product) =>
        product.toString()
      );
      const isProductApply = productIds.every((productId) =>
        applyProductIds.includes(productId)
      );
      if (!isProductApply) {
        return res
          .status(400)
          .json({ message: "Voucher not applicable to these product" });
      }
    }

    if (voucher.applyCategories.length) {
      const applyCategory = voucher.applyCategories.map((category) =>
        category.toString()
      );
      const isApplyCategory = categories.every((category) =>
        applyCategory.includes(category)
      );
      if (!isApplyCategory) {
        return res
          .status(400)
          .json({ message: "Voucher not applicable to these category" });
      }
    }

    voucher.usedCount += 1;
    await voucher.save();
    res.status(200).json({ message: "Voucher applied successfully" });
  } catch (error) {
    next(error);
  }
};

export const getVoucherByProductIds = async (req, res, next) => {
  const { productIds } = req.params;
  if (!req.user.id) {
    return res.status(401).json({ message: "You are not authenticated" });
  }
  try {
    const productIdArray = productIds ? productIds.split(",") : [];
    const allVouchers = await Voucher.find();
    // some() : at least one productId match >< every()
    const applicableVouchers = allVouchers.filter((voucher) => {
      const appliesToProducts = voucher.applyProducts.some((productId) =>
        productIdArray.includes(productId.toString())
      );
      return appliesToProducts;
    });
    if (applicableVouchers.length === 0) {
      return res.status(404).json({ message: "No vouchers found" });
    }
    res.status(200).json(applicableVouchers);
  } catch (error) {
    next(error);
  }
};

export const exportVouchers = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to export vouchers" });
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Vouchers");

  // Define columns
  worksheet.columns = [
    { header: "ID", key: "_id", width: 25 },
    { header: "Code", key: "code", width: 20 },
    { header: "Discount", key: "discount", width: 15 },
    { header: "Expiry Date", key: "expiryDate", width: 20 },
    { header: "Usage Limit", key: "usageLimit", width: 15 },
    { header: "Used Count", key: "usedCount", width: 15 },
    { header: "Apply Products", key: "applyProducts", width: 40 },
    { header: "Apply Categories", key: "applyCategories", width: 40 },
    { header: "Status", key: "status", width: 15 },
    { header: "Created At", key: "createdAt", width: 25 },
    { header: "Updated At", key: "updatedAt", width: 25 },
  ];

  try {
    const vouchers = await Voucher.find();

    vouchers.forEach((voucher) => {
      const productIds =
        voucher.applyProducts?.map((prod) => prod.toString()).join(", ") ||
        "N/A";
      const categoryIds =
        voucher.applyCategories?.map((cat) => cat.toString()).join(", ") ||
        "N/A";

      worksheet.addRow({
        _id: voucher._id.toString(),
        code: voucher.code,
        discount: voucher.discount,
        expiryDate: new Date(voucher.expiryDate).toLocaleDateString(),
        usageLimit: voucher.usageLimit,
        usedCount: voucher.usedCount,
        applyProducts: productIds,
        applyCategories: categoryIds,
        status: voucher.status,
        createdAt: new Date(voucher.createdAt).toLocaleDateString(),
        updatedAt: new Date(voucher.updatedAt).toLocaleDateString(),
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=" + "vouchers.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting vouchers to Excel:", error);
    res.status(500).send("Failed to export vouchers to Excel");
  }
};

export const getVoucherStatistic = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not authorized to get all order statuses" });
  }

  try {
    const result = await Voucher.aggregate([
      {
        $sort: {
          usedCount: -1,
        },
      },
      {
        $facet: {
          mostUsed: [{ $limit: 1 }], // Top voucher
          leastUsed: [{ $sort: { usedCount: 1 } }, { $limit: 1 }], // Least used voucher
        },
      },
    ]);

    const mostUsed = result[0]?.mostUsed?.[0] || null;
    const leastUsed = result[0]?.leastUsed?.[0] || null;

    res.status(200).json({
      mostUsed,
      leastUsed,
    });
  } catch (error) {
    next(error);
  }
};
