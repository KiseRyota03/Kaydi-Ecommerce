import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
    price: {
      type: Number,
      required: true,
    },
    stock: {
      type: Number,
      required: true,
    },
    sizes: [
      {
        type: String,
        required: true,
      },
    ],
    categories: [
      {
        type: String,
        required: false,
      },
    ],

    colors: [
      {
        type: String,
        required: true,
      },
    ],
    listingPhotoPaths: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Product = mongoose.model("Product", productSchema);

export default Product;
