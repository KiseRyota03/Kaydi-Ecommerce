// tests/helpers/reviewHelper.js

import Review from "../../models/reviewModel.js";
import mongoose from "mongoose";

/**
 * Creates a sample review document in the database.
 * @param {Object} overrides - Optional fields to override default data.
 * @returns {Promise<Review>} The created Review document.
 */
export async function createReview(overrides = {}) {
  const defaultData = {
    creator: new mongoose.Types.ObjectId(),
    product: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(),
    rating: 4,
    comment: "Very nice product",
    image: "img.jpg",
  };

  const review = new Review({ ...defaultData, ...overrides });
  return await review.save();
}

/**
 * Creates multiple reviews for testing pagination or aggregation.
 * @param {Object} options - Options to customize the batch.
 * @param {Number} options.count - Number of reviews to create.
 * @param {Object} options.commonFields - Fields shared across all reviews.
 * @returns {Promise<Review[]>} Array of created Review documents.
 */
export async function createMultipleReviews({
  count = 5,
  commonFields = {},
} = {}) {
  const reviews = [];
  for (let i = 0; i < count; i++) {
    const review = new Review({
      creator: commonFields.creator || new mongoose.Types.ObjectId(),
      product: commonFields.product || new mongoose.Types.ObjectId(),
      order: new mongoose.Types.ObjectId(),
      rating: (i % 5) + 1,
      comment: `Review ${i + 1}`,
      image: `img${i + 1}.jpg`,
    });
    reviews.push(review);
  }
  return await Review.insertMany(reviews);
}
