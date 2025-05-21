import Product from "../models/productModel.js";
import Category from "../models/categoryModel.js";
import ExcelJS from "exceljs";

export const createCategory = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to create category" });
  }

  const { name, title, description, heroImage } = req.body;
  const newCategory = new Category({
    name,
    title,
    description,
    heroImage,
  });

  try {
    const savedCategory = await newCategory.save();
    return res.status(201).json(savedCategory);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

export const getAllCategories = async (req, res, next) => {
  try {
    const findAllCategory = await Category.find().sort({ createdAt: 1 });
    const totalCategory = await Category.countDocuments();

    if (findAllCategory.length === 0) {
      return res.status(404).json({ message: "No category found" });
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

    const lastWeekCategory = await Category.find({
      createdAt: { $gte: oneWeekAgo },
    });

    const lastMonthCategory = await Category.find({
      createdAt: { $gte: oneMonthAgo },
    });

    return res.status(200).json({
      totalCategory: totalCategory,
      lastWeekCategoryCount: lastWeekCategory.length,
      lastWeekCategory: lastWeekCategory,
      lastMonthCategoryCount: lastMonthCategory.length,
      lastMonthCategory: lastMonthCategory,
      allCategories: findAllCategory,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to delete category" });
  }
  try {
    const categoryId = req.params.categoryId;
    await Category.findByIdAndDelete(categoryId);
    return res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to update category" });
  }
  const categoryId = req.params.categoryId;
  try {
    const updatedCategory = await Category.findByIdAndUpdate(
      categoryId,
      {
        $set: {
          name: req.body.name,
          title: req.body.title,
          description: req.body.description,
          heroImage: req.body.heroImage,
        },
      },
      { new: true }
    );
    res.status(200).json(updatedCategory);
  } catch (error) {
    next(error);
  }
};

export const getEachCategory = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to view this category" });
  }
  const categoryId = req.params.categoryId;
  try {
    const findCategory = await Category.findById(categoryId);
    if (findCategory.length === 0) {
      return res
        .status(404)
        .json({ message: "No category found with this id" });
    } else {
      return res.status(200).json(findCategory);
    }
  } catch (error) {
    next(error);
  }
};

export const getCategoriesFromNewest = async (req, res, next) => {
  try {
    const findAllCategory = await Category.find().sort({ createdAt: -1 });
    const totalCategory = await Category.countDocuments();

    if (findAllCategory.length === 0) {
      return res.status(404).json({ message: "No category found" });
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

    const lastWeekCategory = await Category.find({
      createdAt: { $gte: oneWeekAgo },
    });

    const lastMonthCategory = await Category.find({
      createdAt: { $gte: oneMonthAgo },
    });

    return res.status(200).json({
      totalCategory: totalCategory,
      lastWeekCategoryCount: lastWeekCategory.length,
      lastWeekCategory: lastWeekCategory,
      lastMonthCategoryCount: lastMonthCategory.length,
      lastMonthCategory: lastMonthCategory,
      allCategories: findAllCategory,
    });
  } catch (error) {
    next(error);
  }
};

export const getCategoryByName = async (req, res, next) => {
  const { name } = req.params;
  try {
    const findCategory = await Category.findOne({ name: name });
    if (findCategory.length === 0) {
      return res
        .status(404)
        .json({ message: "No category found with this name" });
    }
    res.status(200).json(findCategory);
  } catch (error) {
    next(error);
  }
};

export const exportCategories = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to export categories" });
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Categories");

  // Define columns for the categories
  worksheet.columns = [
    { header: "ID", key: "_id", width: 20 },
    { header: "Name", key: "name", width: 30 },
    { header: "Title", key: "title", width: 30 },
    { header: "Description", key: "description", width: 60 },
    { header: "Hero Image", key: "heroImage", width: 60 },
    { header: "Created At", key: "createdAt", width: 20 },
    { header: "Updated At", key: "updatedAt", width: 20 },
  ];

  try {
    // Fetch all categories from the database
    const categories = await Category.find();

    // Add each category as a row in the worksheet
    categories.forEach((category) => {
      const description = category.description?.join(", ") || ""; // Convert array to string
      worksheet.addRow({
        _id: category._id.toString(),
        name: category.name,
        title: category.title,
        description: description,
        heroImage: category.heroImage,
        createdAt: category.createdAt.toLocaleDateString(),
        updatedAt: category.updatedAt.toLocaleDateString(),
      });
    });

    // Set response headers for Excel download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=categories.xlsx"
    );

    // Write the workbook to the response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting categories to Excel:", error);
    res.status(500).send("Failed to export categories to Excel");
  }
};
