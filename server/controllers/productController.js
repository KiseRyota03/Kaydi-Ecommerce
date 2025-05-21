import Product from "../models/productModel.js";
import ExcelJS from "exceljs";

export const createProduct = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to create product" });
  }

  const newProduct = new Product({
    name: req.body.name,
    description: req.body.description,
    price: req.body.price,
    stock: req.body.stock,
    categories: req.body.categories,
    sizes: req.body.sizes,
    colors: req.body.colors,
    listingPhotoPaths: req.body.listingPhotoPaths,
  });

  try {
    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    next(error);
  }
};

export const getRecentProduct = async (req, res, next) => {
  try {
    const limitNumber = req.params.limitNumber;
    const limitListing = parseInt(limitNumber);
    const listProduct = await Product.find()
      .limit(limitListing)
      .sort({ createdAt: -1 });
    if (listProduct.length === 0) {
      return res.status(404).json({ message: "No product found" });
    }
    res.status(200).json(listProduct);
  } catch (error) {
    next(error);
  }
};

export const getAllProduct = async (req, res, next) => {
  try {
    const allProducts = await Product.find();
    const totalNumber = await Product.countDocuments();

    if (allProducts.length === 0) {
      return res.status(404).json({ message: "No product found" });
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

    const lastWeekProduct = await Product.find({
      createdAt: { $gte: oneWeekAgo },
    });

    const lastMonthProduct = await Product.find({
      createdAt: { $gte: oneMonthAgo },
    });

    res.status(200).json({
      totalNumber: totalNumber,
      lastWeekProductCount: lastWeekProduct.length,
      lastMonthProductCount: lastMonthProduct.length,
      lastWeekProduct: lastWeekProduct,
      lastMonthProduct: lastMonthProduct,
      allProducts: allProducts,
    });
  } catch (error) {
    next(error);
  }
};

export const getProductPagination = async (req, res, next) => {
  try {
    const totalNumber = await Product.countDocuments();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const listProducts = await Product.find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    if (listProducts.length === 0) {
      return res.status(404).json({ message: "No product found" });
    }

    res.status(200).json({
      totalNumber: totalNumber,
      currentPage: page,
      totalPages: Math.ceil(totalNumber / limit),
      listProducts: listProducts,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to update product" });
  }
  try {
    const productId = req.params.productId;
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        $set: {
          name: req.body.name,
          description: req.body.description,
          price: req.body.price,
          stock: req.body.stock,
          categories: req.body.categories,
          sizes: req.body.sizes,
          colors: req.body.colors,
          listingPhotoPaths: req.body.listingPhotoPaths,
        },
      },
      { new: true }
    );
    res.status(200).json(updatedProduct);
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to delete product" });
  }
  try {
    const productId = req.params.productId;
    await Product.findByIdAndDelete(productId);
    res.status(200).json({ message: "Product delete successfully" });
  } catch (error) {
    next(error);
  }
};

export const getEachProduct = async (req, res, next) => {
  const { productId } = req.params;
  try {
    const findProduct = await Product.findById(productId);
    if (!findProduct) {
      return res.status(404).json({ message: "No product found!" });
    }
    res.status(200).json(findProduct);
  } catch (error) {
    next(error);
  }
};

export const getProductBySearch = async (req, res, next) => {
  const { searchKey } = req.params;

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const allProducts = await Product.find({
      name: {
        $regex: searchKey,
        $options: "i",
      },
    });

    const findProducts = await Product.find({
      name: {
        $regex: searchKey,
        $options: "i",
      },
    })
      .skip(skip)
      .limit(limit);

    if (findProducts.length === 0) {
      return res.json({ message: "No product found with this name" });
    }

    const totalNumber = allProducts.length;

    res.status(200).json({
      totalNumber: totalNumber,
      currentPage: page,
      totalPages: Math.ceil(totalNumber / limit),
      findProducts: findProducts,
    });
  } catch (error) {
    next(error);
  }
};

export const exportProducts = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res
      .status(401)
      .json({ message: "You are not allowed to export users" });
  }
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Products");

  worksheet.columns = [
    { header: "ID", key: "_id", width: 10 },
    { header: "Name", key: "name", width: 30 },
    { header: "Description", key: "description", width: 60 },
    { header: "Price", key: "price", width: 15 },
    { header: "Stock", key: "stock", width: 10 },
    { header: "Categories", key: "categories", width: 30 },
    { header: "Sizes", key: "sizes", width: 15 },
    { header: "Colors", key: "colors", width: 20 },
    { header: "Listing Photo Paths", key: "listingPhotoPaths", width: 60 },
    { header: "Created At", key: "createdAt", width: 20 },
    { header: "Updated At", key: "updatedAt", width: 20 },
  ];
  try {
    const products = await Product.find();

    products.forEach((product) => {
      worksheet.addRow({
        _id: product._id.toString(),
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        categories: product.categories.join(", "),
        sizes: product.sizes.join(", "),
        colors: product.colors.join(", "),
        listingPhotoPaths: product.listingPhotoPaths.join(", "),
        createdAt: new Date(product.createdAt).toLocaleDateString(),
        updatedAt: new Date(product.updatedAt).toLocaleDateString(),
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="products.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end(); // End the response
  } catch (error) {
    console.error("Error exporting products to Excel:", error);
    res.status(500).send("Failed to export products to Excel");
  }
};

export const getRecommendProducts = async (req, res, next) => {
  const { productId } = req.params;
  try {
    const findProduct = await Product.findById(productId);

    if (findProduct.length === 0) {
      return res.json({ message: "No products found" });
    }

    const productCategories = findProduct.categories;

    let findCategory = "";

    const categoryPairs = {
      shirt: "pants",
      pants: "shirt",
      underwear: "sport",
      sport: "underwear",
      accessory: "accessory",
    };

    const matchedCategory = productCategories.find(
      (category) => category in categoryPairs
    );
    if (matchedCategory) {
      findCategory = categoryPairs[matchedCategory];
    }

    const findProductsByCategory = await Product.find({
      categories: findCategory,
    })
      .limit(8)
      .sort({ createdAt: -1 });

    if (findProductsByCategory.length === 0) {
      return res.json({ message: "No product match in this category" });
    }

    res.status(200).json(findProductsByCategory);
  } catch (error) {
    next(error);
  }
};

export const getProductByCategory = async (req, res, next) => {
  const category = req.params.category;
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const allProducts = await Product.find({ categories: category });

    const findProductByCategory = await Product.find({ categories: category })
      .skip(skip)
      .limit(limit);

    const totalNumber = allProducts.length;

    if (findProductByCategory.length === 0) {
      return res.json({ message: "No product match in this category" });
    }
    res.status(200).json({
      totalNumber,
      currentPage: page,
      totalPages: Math.ceil(totalNumber / limit),
      findProductByCategory,
    });
  } catch (error) {
    next(error);
  }
};

export const getProductByPriceRange = async (req, res, next) => {
  try {
    const { minPrice, maxPrice } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const query = {};

    if (minPrice) {
      query.price = {
        ...query.price,
        $gte: Number(minPrice),
      };
    }

    if (maxPrice) {
      query.price = {
        ...query.price,
        $lte: Number(maxPrice),
      };
    }

    const totalNumber = await Product.countDocuments(query);

    const products = await Product.find(query).skip(skip).limit(limit);

    res.status(200).json({
      totalNumber,
      currentPage: page,
      totalPages: Math.ceil(totalNumber / limit),
      products,
    });
  } catch (error) {
    next(error);
  }
};

export const getProductByFilter = async (req, res, next) => {
  const { filterType } = req.params;
  const { products } = req.body;

  if (!Array.isArray(products)) {
    return res.status(400).json({ message: "Invalid products data!" });
  }

  let sortOption = {};

  switch (filterType) {
    case "priceLowToHigh":
      sortOption = (a, b) => a.price - b.price; // ascending
      break;

    case "priceHighToLow":
      sortOption = (a, b) => b.price - a.price; // descending
      break;

    case "nameAZ":
      sortOption = (a, b) =>
        new Intl.Collator("vi", { sensitivity: "base" }).compare(
          a.name,
          b.name
        ); // ascending
      break;

    case "nameZA":
      sortOption = (a, b) =>
        new Intl.Collator("vi", { sensitivity: "base" }).compare(
          b.name,
          a.name
        ); // descending
      break;

    default:
      return res.status(400).json({ message: "Invalid filter type!" });
  }

  try {
    // Sort the products array based on the sortOption
    const sortedProducts = products.sort(sortOption);

    if (sortedProducts.length === 0) {
      return res.json({ message: "No product found!" });
    }

    res.status(200).json(sortedProducts);
  } catch (error) {
    next(error);
  }
};

export const getProductCombination = async (req, res, next) => {
  const { category } = req.params;
  const { minPrice, maxPrice } = req.query;

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const query = {};

    if (category && category !== "all") {
      query.categories = category;
    }

    if (minPrice !== null && !isNaN(Number(minPrice))) {
      query.price = query.price || {};
      query.price.$gte = Number(minPrice);
    }
    if (maxPrice !== null && !isNaN(Number(maxPrice))) {
      query.price = query.price || {};
      query.price.$lte = Number(maxPrice);
    }

    const totalNumber = await Product.countDocuments(query);

    const products = await Product.find(query).skip(skip).limit(limit);

    if (products.length === 0) {
      return res
        .status(404)
        .json({ message: "No products match your criteria." });
    }

    res.status(200).json({
      totalNumber,
      currentPage: page,
      totalPages: Math.ceil(totalNumber / limit),
      products,
    });
  } catch (error) {
    next(error);
  }
};

export const searchProductAdmin = async (req, res, next) => {
  const { searchKey } = req.params;

  if (!req.user.isAdmin) {
    return res
      .status(403)
      .json({ message: "You are not admin to perform this action." });
  }

  try {
    const findProducts = await Product.find({
      name: {
        $regex: searchKey,
        $options: "i",
      },
    });

    if (findProducts.length === 0) {
      return res.json({ message: "No product found with this name" });
    }

    res.status(200).json(findProducts);
  } catch (error) {
    next(error);
  }
};
