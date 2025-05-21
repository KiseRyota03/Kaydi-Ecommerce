import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import Product from "../models/productModel.js";
import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();
import ExcelJS from "exceljs";
import mongoose from "mongoose";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createOrder = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "You are not logged in" });
  }
  const {
    userId,
    receiverName,
    receiverPhone,
    receiverNote,
    products,
    totalAmount,
    shippingAddress,
    paymentMethod,
  } = req.body;

  try {
    if (paymentMethod !== "COD") {
      return res
        .status(400)
        .json({ message: "Other function are not supported" });
    }

    for (const product of products) {
      const findProduct = await Product.findById(product.productId);
      if (!findProduct) {
        return res.status(404).json({ message: "Product not found" });
      }
      if (findProduct.stock < product.quantity) {
        return res.status(400).json({ message: "Not enough stock" });
      }

      findProduct.stock -= product.quantity;
      await findProduct.save();
    }

    const newOrder = new Order({
      userId,
      receiverName,
      receiverPhone,
      receiverNote,
      products,
      totalAmount,
      shippingAddress,
      paymentMethod,
    });

    await newOrder.save();
    res.status(200).json(newOrder);
  } catch (error) {
    console.error("❌ Failed to create order:", error.message, error.stack);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

export const getAllOrder = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not admin to do this action" });
  }
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;

    const skip = (page - 1) * limit;

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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const allOrders = await Order.find();
    const totalOrders = await Order.countDocuments();

    const totalPages = Math.ceil(totalOrders / limit);

    const findOrder = await Order.find()
      .populate("userId products.productId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    if (findOrder.length === 0) {
      return res.status(404).json({ message: "No order found" });
    }

    // Count orders for specific timeframes
    const [todayOrder, lastWeekOrder, lastMonthOrder] = await Promise.all([
      Order.find({ createdAt: { $gte: today } }).countDocuments(),
      Order.find({ createdAt: { $gte: oneWeekAgo } }).countDocuments(),
      Order.find({ createdAt: { $gte: oneMonthAgo } }).countDocuments(),
    ]);

    res.status(200).json({
      numberOfOrder: totalOrders,
      currentPage: page,
      totalPages,
      todayOrder,
      lastWeekOrder,
      lastMonthOrder,
      findOrder,
    });
  } catch (error) {
    next(error);
  }
};

export const editOrder = async (req, res, next) => {
  const { orderId } = req.params;
  const {
    receiverName,
    receiverPhone,
    receiverNote,
    products,
    totalAmount,
    shippingAddress,
    paymentMethod,
    status,
  } = req.body;
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not admin to edit this order" });
  }
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    const updates = {
      receiverName,
      receiverPhone,
      receiverNote,
      products,
      totalAmount,
      shippingAddress,
      paymentMethod,
      status,
    };

    const currentTime = new Date();
    if (status === "processing" && !order.processingTime) {
      updates.processingTime = currentTime;
    }
    if (status === "shipped" && !order.shippedTime) {
      updates.shippedTime = currentTime;
    }
    if (status === "delivered" && !order.deliveredTime) {
      updates.deliveredTime = currentTime;
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: updates,
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json(updatedOrder);
  } catch (error) {
    next(error);
  }
};

export const cancelOrder = async (req, res, next) => {
  const { userId, orderId } = req.params;
  if (!req.user.id) {
    return res.status(401).json({ message: "You are not logged in" });
  }
  try {
    const findOrder = await Order.findById(orderId);
    if (!findOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (findOrder.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to cancel this order" });
    }
    if (findOrder.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Order is in processing, can not be cancel!" });
    }
    await Order.findByIdAndDelete(orderId);
    res.status(200).json({ message: "Order canceled successfully" });
  } catch (error) {
    next(error);
  }
};

export const getUserOrder = async (req, res, next) => {
  const { userId } = req.params;
  if (!req.user.isAdmin && req.user.id !== userId) {
    return res
      .status(401)
      .json({ message: "You are not authorized to get this user order " });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const skip = (page - 1) * limit;

  try {
    const allUserOrder = await Order.find({ userId });

    const findUserOrder = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    if (findUserOrder.length === 0) {
      return res.status(404).json({ message: "No order found for this user" });
    }

    const totalOrders = allUserOrder.length;
    const totalPages = Math.ceil(totalOrders / limit);

    res.status(200).json({
      totalOrders,
      currentPage: page,
      totalPages,
      findUserOrder,
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req, res, next) => {
  const { orderId } = req.params;
  if (!req.user.id) {
    return res.status(401).json({ message: "You are not logged in" });
  }
  try {
    const findOrder = await Order.findById(orderId).populate("userId products");
    if (!findOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json(findOrder);
  } catch (error) {
    next(error);
  }
};

export const paymentWithStripe = async (req, res, next) => {
  if (!req.user.id) {
    return res.status(401).json({ message: "You are not logged in" });
  }

  const {
    userId,
    receiverName,
    receiverPhone,
    receiverNote,
    products,
    totalAmount,
    shippingAddress,
    paymentMethod,
  } = req.body;

  if (paymentMethod === "COD") {
    return res
      .status(404)
      .json({ message: "This method does not need to pay by Stripe" });
  }

  const lineItems = products.map((product) => ({
    price_data: {
      currency: "vnd",
      product_data: {
        name: `${product.name} - ${product.size} - ${product.color}`,
        images: [product.image],
        metadata: {
          color: product.color,
          size: product.size,
        },
      },
      unit_amount: product.price,
    },
    quantity: product.quantity,
  }));
  try {
    // tuong tu nhu new Order({}) + await newOrder.save()
    const newOrder = await Order.create({
      userId,
      receiverName,
      receiverPhone,
      receiverNote,
      products,
      totalAmount,
      shippingAddress,
      paymentMethod,
      paymentCheck: false,
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      shipping_address_collection: {
        allowed_countries: ["VN"],
      },
      shipping_options: [
        {
          shipping_rate: "shr_1PnhJ3ELWvlzH2IqYGJRn3KR", // free ship
          // shipping_rate: "shr_1PnhI3ELWvlzH2IqQxOkTi8p", //ship
        },
      ],
      line_items: lineItems,
      client_reference_id: userId,
      success_url: `${process.env.ECOMMERCE_STORE_URL}/paymentSuccess/${newOrder._id}`,
      cancel_url: `${process.env.ECOMMERCE_STORE_URL}/cart`,
      metadata: {
        receiverName,
        receiverPhone,
        receiverNote,
        shippingAddress,
        totalAmount,
      },
    });

    res.status(200).json({ id: session.id });
  } catch (error) {
    next(error);
  }
};

export const updateOrderPaymentCheck = async (req, res, next) => {
  const { orderId } = req.params;

  try {
    const findOrder = await Order.findById(orderId);
    if (!findOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    findOrder.paymentCheck = true;
    await findOrder.save();
    res.status(200).json(findOrder);
  } catch (error) {
    next(error);
  }
};

export const getTotalAmountPerDay = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not admin to get total amount per day" });
  }
  try {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );
    const startOfNextMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1
    );

    const totalAmountPerDay = await Order.aggregate([
      {
        // Match only orders created in the current month
        $match: {
          createdAt: {
            $gte: startOfMonth,
            $lt: startOfNextMonth,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
      // Sort the results by date in ascending order
      {
        $sort: { _id: 1 },
      },
    ]);

    res.status(200).json(totalAmountPerDay);
  } catch (error) {
    next(error);
  }
};

export const getTotalAmountPerMonth = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(401).json({
      message: "You are not authorized to get total amount per month",
    });
  }
  try {
    const totalAmountPerMonth = await Order.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$createdAt" },
          },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
      // Sort the results by month in ascending order
      {
        $sort: { _id: 1 },
      },
    ]);

    res.status(200).json(totalAmountPerMonth);
  } catch (error) {
    next(error);
  }
};

export const getAllOrdersOfCustomer = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not admin to get all orders of user" });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const ordersByEachUser = await Order.aggregate([
      {
        $group: {
          _id: "$userId",
          totalOrders: { $sum: 1 },
          totalAmountSpent: { $sum: "$totalAmount" }, // Ensure this field exists as well
        },
      },
      {
        $lookup: {
          from: "users", // collection name of User model
          localField: "_id", // the field to grouping by
          foreignField: "_id", // the field in the User collection
          as: "userInfo", // create an array to get user details
        },
      },
      {
        $unwind: "$userInfo",
      },
      {
        $sort: { totalOrders: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          totalOrders: 1,
          totalAmountSpent: 1,
          "userInfo.username": 1,
          "userInfo.email": 1,
          "userInfo.phoneNumber": 1,
          "userInfo.gender": 1,
        },
      },
    ]);

    const totalOrdersCount = await Order.aggregate([
      {
        $group: {
          _id: "$userId",
        },
      },
      { $count: "total" }, // Count the number of distinct userIds
    ]);

    const totalCount = totalOrdersCount[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      totalOrders: totalCount,
      currentPage: page,
      totalPages,
      ordersByEachUser,
    });
  } catch (error) {
    next(error);
  }
};

export const exportOrders = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to export orders" });
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Orders");

  // Define columns for the orders
  worksheet.columns = [
    { header: "Order ID", key: "_id", width: 20 },
    { header: "User ID", key: "userId", width: 20 },
    { header: "Receiver Name", key: "receiverName", width: 25 },
    { header: "Receiver Phone", key: "receiverPhone", width: 15 },
    { header: "Receiver Note", key: "receiverNote", width: 15 },
    { header: "Shipping Address", key: "shippingAddress", width: 30 },
    { header: "Total Amount", key: "totalAmount", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Payment Method", key: "paymentMethod", width: 15 },
    { header: "Payment Check", key: "paymentCheck", width: 15 },
    { header: "Created At", key: "createdAt", width: 20 },
    { header: "Processing Time", key: "processingTime", width: 20 },
    { header: "Shipped Time", key: "shippedTime", width: 20 },
    { header: "Delivered Time", key: "deliveredTime", width: 20 },
    { header: "Products", key: "products", width: 60 },
  ];

  try {
    const orders = await Order.find()
      .populate("userId")
      .populate("products.productId");

    orders.forEach((order) => {
      // Concatenate product details into a readable format
      const productsInfo = order.products
        .map(
          (p) =>
            `Name: ${p.name}, Qty: ${p.quantity}, Price: ${p.price}, Color: ${p.color}, Size: ${p.size}`
        )
        .join("\n");

      worksheet.addRow({
        _id: order._id.toString(),
        userId: order.userId?._id.toString() || "N/A", // Adjust if the userId field is populated
        receiverName: order.receiverName,
        receiverPhone: order.receiverPhone,
        receiverNote: order.receiverNote || "",
        shippingAddress: order.shippingAddress,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentCheck: order.paymentCheck ? "Checked" : "Not Checked",
        createdAt: order.createdAt.toISOString(),
        processingTime: order.processingTime?.toISOString() || "N/A",
        shippedTime: order.shippedTime?.toISOString() || "N/A",
        deliveredTime: order.deliveredTime?.toISOString() || "N/A",
        products: productsInfo,
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=orders.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting orders to Excel:", error);
    res.status(500).send("Failed to export orders to Excel");
  }
};

export const getAllOrderStatus = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not authorized to get all order statuses" });
  }
  try {
    const statusCounts = await Order.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1,
        },
      },
    ]);

    const result = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
    };

    statusCounts.forEach(({ status, count }) => {
      result[status] = count;
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getOrderTotalRevenue = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not authorized to get order total revenue" });
  }
  try {
    const now = new Date();

    const firstDayOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );
    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const startOfThisMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );
    const startOfNextMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1
    );

    const revenues = await Order.aggregate([
      {
        $facet: {
          totalRevenue: [
            {
              $group: {
                _id: null,
                total: { $sum: "$totalAmount" },
              },
            },
          ],
          lastMonthRevenue: [
            {
              $match: {
                createdAt: {
                  $gte: firstDayOfLastMonth,
                  $lte: lastDayOfLastMonth,
                },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$totalAmount" },
              },
            },
          ],
          currentMonthRevenue: [
            {
              $match: {
                createdAt: {
                  $gte: startOfThisMonth,
                  $lte: startOfNextMonth,
                },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$totalAmount" },
              },
            },
          ],
        },
      },
    ]);

    const totalRevenue = revenues[0]?.totalRevenue[0]?.total || 0;
    const lastMonthRevenue = revenues[0]?.lastMonthRevenue[0]?.total || 0;
    const thisMonthRevenue = revenues[0]?.currentMonthRevenue[0]?.total || 0;

    return res.status(200).json({
      totalRevenue,
      lastMonthRevenue,
      thisMonthRevenue,
    });
  } catch (error) {
    next(error);
  }
};

export const searchOrderAdmin = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not admin to search orders" });
  }

  const { searchKey } = req.params;

  try {
    let query = {};

    if (mongoose.Types.ObjectId.isValid(searchKey)) {
      query._id = searchKey;
    } else {
      query.receiverName = {
        $regex: searchKey,
        $options: "i",
      };
    }

    const allFoundedOrders = await Order.find(query);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    if (allFoundedOrders.length === 0) {
      return res.json({ message: "No order founded" });
    }

    const totalPages = Math.ceil(allFoundedOrders.length / limit);

    const ordersPagination = await Order.find(query).limit(limit).skip(skip);

    res.status(200).json({
      numberOfOrder: allFoundedOrders.length,
      currentPage: page,
      totalPages,
      findOrder: ordersPagination,
    });
  } catch (error) {
    next(error);
  }
};
