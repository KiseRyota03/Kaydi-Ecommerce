import Cart from "../models/cartModel.js";
import User from "../models/userModel.js";
import Product from "../models/productModel.js";

export const addToCart = async (req, res, next) => {
  const { userId, productId, quantity, color, size } = req.body;

  if (req.user.id !== userId) {
    return res.status(401).json({
      message: "You are not allowed to add this product to cart",
    });
  }

  try {
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, products: [] });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const productIndex = cart.products.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        item.color === color &&
        item.size === size
    );

    if (productIndex !== -1) {
      cart.products[productIndex].quantity += quantity;
    } else {
      cart.products.push({
        productId,
        name: product.name,
        quantity,
        price: product.price,
        color,
        size,
        image: product.listingPhotoPaths[0],
      });
    }

    cart.subtotal = cart.products.reduce(
      (total, item) => total + item.quantity * item.price,
      0
    );

    const updatedCart = await cart.save();
    return res.status(200).json(updatedCart);
  } catch (error) {
    console.error("🔥 addToCart failed:", error); // ✅ ADD THIS LINE
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// xoa san pham theo productId trong gio hang
export const removeFromCart = async (req, res, next) => {
  const { userId, productId, color, size } = req.body;
  try {
    // Find the cart for the user
    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Find the index of the product in the cart
    const productIndex = cart.products.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        item.color === color &&
        item.size === size
    );
    if (productIndex === -1) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    // Remove the product from the cart
    cart.products.splice(productIndex, 1);

    // Update the subtotal
    cart.subtotal = cart.products.reduce(
      (total, item) => total + item.quantity * item.price,
      0
    );

    // Save the updated cart
    const updatedCart = await cart.save();

    const totalProducts = updatedCart.products.reduce(
      (total, item) => total + item.quantity,
      0
    );

    res.status(200).json({
      totalProducts,
      cart: updatedCart,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserCart = async (req, res, next) => {
  const { userId } = req.params;

  if (req.user.id !== userId) {
    return res
      .status(401)
      .json({ message: "You are not allowed to view this" });
  }

  try {
    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.json({ message: "This user don't have any items in cart" });
    }

    const uniqueProductCount = cart.products.length;

    const totalProducts = cart.products.reduce(
      (total, item) => total + item.quantity,
      0
    );

    res.status(200).json({
      totalProducts,
      uniqueProductCount,
      cart,
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserCart = async (req, res, next) => {
  const { productId, color, size, quantity, actionType } = req.body;
  const userId = req.params.userId;
  if (req.user.id !== userId) {
    return res
      .status(401)
      .json({ message: "You are not allowed to update this user cart" });
  }
  try {
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, products: [] });
    }

    const existingItem = cart.products.find(
      (item) =>
        item.productId.toString() === productId &&
        item.color === color &&
        item.size === size
    );

    if (existingItem) {
      if (actionType === "inc") {
        existingItem.quantity += quantity;
      } else if (actionType === "dec") {
        existingItem.quantity -= quantity;
        if (existingItem.quantity <= 0) {
          cart.products = cart.products.filter(
            (item) =>
              !(
                item.productId.toString() === productId &&
                item.color === color &&
                item.size === size
              )
          );
        }
      }
    } else {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    cart.subtotal = cart.products.reduce(
      (total, item) => total + item.quantity * item.price,
      0
    );

    const updatedCart = await cart.save();

    const uniqueProductCount = updatedCart.products.length;

    const totalProducts = updatedCart.products.reduce(
      (total, item) => total + item.quantity,
      0
    );

    res.status(200).json({
      totalProducts,
      cart: updatedCart,
    });
  } catch (error) {
    next(error);
  }
};

export const getItemsInCart = async (req, res, next) => {
  const { userId, chooseItems } = req.body;
  if (req.user.id !== userId) {
    return res
      .status(401)
      .json({ message: "You are not allowed to access this function" });
  }
  try {
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const foundItems = cart.products.filter((item) =>
      chooseItems.some(
        (searchItem) =>
          item.productId.toString() === searchItem.productId &&
          item.size === searchItem.size &&
          item.color === searchItem.color
      )
    );

    if (foundItems.length === 0) {
      return res.status(404).json({ message: "No items found in cart" });
    }

    res.status(200).json(foundItems);
  } catch (error) {
    next(error);
  }
};

// xoa tat ca san pham trong gio hang
export const removeItemsFromCart = async (req, res, next) => {
  const { userId, productsRemove } = req.body;
  if (req.user.id !== userId) {
    return res
      .status(401)
      .json({ message: "You are not allowed to access this function" });
  }
  try {
    const userCart = await Cart.findOne({ userId });
    if (!userCart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    productsRemove.forEach(({ productId, color, size }) => {
      const productIndex = userCart.products.findIndex(
        (item) =>
          item.productId.toString() === productId &&
          item.color === color &&
          item.size === size
      );

      if (productIndex === -1) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (productIndex !== -1) {
        userCart.products.splice(productIndex, 1);
      }
    });

    userCart.subtotal = userCart.products.reduce(
      (total, item) => total + item.quantity * item.price,
      0
    );

    const totalProducts = userCart.products.reduce(
      (total, item) => total + item.quantity,
      0
    );

    const updatedCart = await userCart.save();
    res.status(200).json({
      message: "Items removed from cart successfully",
      totalProducts: totalProducts,
      cart: updatedCart,
    });
  } catch (error) {
    next(error);
  }
};
