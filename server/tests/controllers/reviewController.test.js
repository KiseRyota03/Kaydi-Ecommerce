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
} = require("../setup/mongoMemoryServer.js");

const reviewController = require("../../controllers/reviewController.js");
const {
  createReview, // Helper to create single review document
  createMultipleReviews, // Helper to create multiple review documents
} = require("../helpers/reviewHelper.js");

// This function creates a test Express app and mocks authentication
// by directly setting req.user.
// The routes defined here map to the controller functions.
const createAppWithAuth = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user; // Mock authenticated user
    next();
  });

  // Routes used for testing controller functions directly
  app.post("/reviews/:userId", reviewController.createReview);
  app.get("/reviews/product/:productId", reviewController.getProductReview);
  app.delete("/reviews/:reviewId", reviewController.deleteProductReview);
  app.put("/reviews/:reviewId", reviewController.editReview);
  app.get("/reviews/user/:userId", reviewController.getUserReview);
  app.post("/reviews/reply/:reviewId", reviewController.replyReview);
  app.get("/reviews/star/:productId", reviewController.sortReviewStar);
  app.get("/reviews/statistic/:productId", reviewController.getReviewStatistic);

  return app;
};

let sampleUserId = new mongoose.Types.ObjectId().toString();
let sampleProductId = new mongoose.Types.ObjectId().toString();
let app;

beforeAll(async () => {
  await connect();
});

afterEach(async () => await clearDatabase());

afterAll(async () => await closeDatabase());

describe("ReviewController Integration", () => {
  beforeEach(() => {
    // Default app for most tests: user is an admin and the sampleUser
    app = createAppWithAuth({ id: sampleUserId, isAdmin: true });
  });

  test("#TC001 -  create a review", async () => {
    const res = await request(app)
      .post(`/reviews/${sampleUserId}`)
      .send({
        productIds: [sampleProductId],
        order: new mongoose.Types.ObjectId().toString(),
        rating: 5,
        comment: "Excellent",
        image: "img1.jpg", // Assuming image can be a string or array based on other tests
      });
    expect(res.status).toBe(200); // Or 201 if your controller returns that for creation
    expect(res.body.length).toBe(1); // Assumes controller returns an array of created reviews
    expect(res.body[0].comment).toBe("Excellent");
  });

  test("#TC002 -  get product reviews with pagination and average rating", async () => {
    await createMultipleReviews({
      count: 3,
      commonFields: { product: sampleProductId },
    });

    const res = await request(app).get(`/reviews/product/${sampleProductId}`);
    expect(res.status).toBe(200);
    expect(res.body.reviews.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty("averageRating");
    // Optionally, check for pagination properties if your controller returns them by default
    // expect(res.body).toHaveProperty("totalReviews");
    // expect(res.body).toHaveProperty("currentPage");
    // expect(res.body).toHaveProperty("totalPages");
  });

  test("#TC003 -  delete a review (as owner/admin)", async () => {
    const review = await createReview({ creator: sampleUserId }); // reviewHelper creates one review

    const res = await request(app).delete(`/reviews/${review._id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Delete review of this product successfully");
  });

  test("#TC004 -  update a review (as owner/admin)", async () => {
    const review = await createReview({ creator: sampleUserId });

    const res = await request(app).put(`/reviews/${review._id}`).send({
      rating: 4,
      comment: "Updated comment",
      image: "img-updated.jpg",
    });
    expect(res.status).toBe(200);
    expect(res.body.comment).toBe("Updated comment");
  });

  test("#TC005 -  fetch reviews by user (as owner/admin)", async () => {
    await createMultipleReviews({
      count: 2,
      commonFields: { creator: sampleUserId },
    });

    const res = await request(app).get(`/reviews/user/${sampleUserId}`);
    expect(res.status).toBe(200);
    expect(res.body.findUserReview.length).toBeGreaterThan(0);
  });

  test("#TC006 -  reply to a review as admin", async () => {
    const review = await createReview(); // reviewHelper creates a review with a default creator

    const res = await request(app) // app is admin
      .post(`/reviews/reply/${review._id}`)
      .send({ text: "Thanks for your feedback!" });
    expect(res.status).toBe(200);
    expect(res.body.reply.length).toBeGreaterThan(0);
  });

  test("#TC007 -  filter reviews by star rating", async () => {
    await createMultipleReviews({
      count: 5,
      commonFields: { product: sampleProductId, rating: 5 },
    });
    await createMultipleReviews({
      // Add some other ratings to ensure filter works
      count: 3,
      commonFields: { product: sampleProductId, rating: 3 },
    });

    const res = await request(app).get(
      `/reviews/star/${sampleProductId}?star=5`
    );
    expect(res.status).toBe(200);
    expect(res.body.reviews.length).toBe(5); // Assuming it correctly filters
    res.body.reviews.forEach((review) => expect(review.rating).toBe(5));
  });

  test("#TC008 - get review statistics", async () => {
    await createMultipleReviews({
      count: 4,
      commonFields: { product: sampleProductId }, // Ratings will be 1, 2, 3, 4
    });

    const res = await request(app).get(`/reviews/statistic/${sampleProductId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(res.body.total).toBe(4);
    // Add more specific checks for statistics if needed (e.g., average, counts per star)
  });

  test("#TC009 - create review - unauthorized (user trying to create review for another user)", async () => {
    const otherUserId = new mongoose.Types.ObjectId().toString();
    const appNonOwner = createAppWithAuth({ id: sampleUserId, isAdmin: false }); // Logged in as sampleUserId

    const res = await request(appNonOwner)
      .post(`/reviews/${otherUserId}`) // Attempting to create for otherUserId
      .send({
        productIds: [sampleProductId],
        order: new mongoose.Types.ObjectId().toString(),
        rating: 3,
        comment: "not allow",
      });

    expect(res.status).toBe(401); // Or 403 depending on your API's convention
    expect(res.body.message).toBe("You are not allowed to create review");
  });

  test("#TC010 - reply review - not admin", async () => {
    const review = await createReview();
    const appNotAdmin = createAppWithAuth({ id: sampleUserId, isAdmin: false });

    const res = await request(appNotAdmin)
      .post(`/reviews/reply/${review._id}`)
      .send({ text: "Nice" });

    expect(res.status).toBe(401); // Or 403
    expect(res.body.message).toBe("You are not allowed to reply this review");
  });

  test("#TC011 - reply review - missing text", async () => {
    const review = await createReview();

    const res = await request(app) // app is admin
      .post(`/reviews/reply/${review._id}`)
      .send({}); // Missing 'text'

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Reply text is required");
  });

  test("#TC012 - get user review - unauthorized (non-admin trying to view other user's reviews)", async () => {
    const otherUserId = new mongoose.Types.ObjectId().toString();
    // Logged in as 'randomUser', not an admin, trying to access 'otherUserId' reviews
    const appOtherUserNonAdmin = createAppWithAuth({
      id: "randomUser",
      isAdmin: false,
    });

    const res = await request(appOtherUserNonAdmin).get(
      `/reviews/user/${otherUserId}`
    );
    expect(res.status).toBe(401); // Or 403
    expect(res.body.message).toBe("You are not allowed to view this");
  });

  test("#TC013 - sort by star - invalid star value", async () => {
    const res = await request(app).get(
      `/reviews/star/${sampleProductId}?star=7` // Invalid star
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid star rating.");
  });

  test("#TC014 - reject review if image contains invalid file types", async () => {
    const res = await request(app)
      .post(`/reviews/${sampleUserId}`)
      .send({
        productIds: [sampleProductId],
        order: new mongoose.Types.ObjectId().toString(),
        rating: 4,
        comment: "Bad image extension",
        image: ["invalid.bmp", "script.exe"], // Array of images
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(
      /must be a valid file with \.jpg, \.jpeg, \.png, or \.webp extension/i
    );
  });

  test("#TC015 - reject review if image size exceeds 20MB", async () => {
    const oversizedBase64 = `data:image/jpeg;base64,${"A".repeat(27_999_999)}`; // ~21MB

    const res = await request(app)
      .post(`/reviews/${sampleUserId}`)
      .send({
        productIds: [sampleProductId],
        order: new mongoose.Types.ObjectId().toString(),
        rating: 4,
        comment: "Too large image",
        image: [oversizedBase64], // Array of images
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid image.*< 20MB/i);
  });

  // --- EXISTING ADDITIONAL TEST CASES ---

  describe("createReview Additional Tests", () => {
    test("#TC016 - create review - missing productIds", async () => {
      const res = await request(app).post(`/reviews/${sampleUserId}`).send({
        // productIds missing
        order: new mongoose.Types.ObjectId().toString(),
        rating: 5,
        comment: "Missing productIds",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Product ID(s are| is) required/i); // Adjust message as per your app
    });

    test("#TC017 - create review - missing order", async () => {
      const res = await request(app)
        .post(`/reviews/${sampleUserId}`)
        .send({
          productIds: [sampleProductId],
          // order missing
          rating: 5,
          comment: "Missing order",
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Order ID is required/i);
    });

    test("#TC018 - create review - missing rating", async () => {
      const res = await request(app)
        .post(`/reviews/${sampleUserId}`)
        .send({
          productIds: [sampleProductId],
          order: new mongoose.Types.ObjectId().toString(),
          // rating missing
          comment: "Missing rating",
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Rating is required/i);
    });

    test("#TC019 - create review - invalid rating (too low)", async () => {
      const res = await request(app)
        .post(`/reviews/${sampleUserId}`)
        .send({
          productIds: [sampleProductId],
          order: new mongoose.Types.ObjectId().toString(),
          rating: 0, // Invalid
          comment: "Invalid rating low",
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Rating must be between 1 and 5/i);
    });

    test("#TC020 - create review - invalid rating (too high)", async () => {
      const res = await request(app)
        .post(`/reviews/${sampleUserId}`)
        .send({
          productIds: [sampleProductId],
          order: new mongoose.Types.ObjectId().toString(),
          rating: 6, // Invalid
          comment: "Invalid rating high",
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Rating must be between 1 and 5/i);
    });

    test("#TC021 - create review - empty productIds array", async () => {
      const res = await request(app).post(`/reviews/${sampleUserId}`).send({
        productIds: [], // Empty array
        order: new mongoose.Types.ObjectId().toString(),
        rating: 5,
        comment: "Empty productIds",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/At least one product ID is required/i);
    });
  });

  describe("getProductReview Additional Tests", () => {
    test("#TC022 - get product reviews - product with no reviews", async () => {
      const newProductIdNoReviews = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(
        `/reviews/product/${newProductIdNoReviews}`
      );
      expect(res.status).toBe(200);
      expect(res.body.reviews).toEqual([]);
      expect(res.body.averageRating).toBe(0); // Or null, adjust to your controller's logic
      expect(res.body.totalReviews).toBe(0); // Assuming this field exists
      // expect(res.body.currentPage).toBe(1); // Assuming defaults if pagination is always present
      // expect(res.body.totalPages).toBe(0); // Or 1
    });

    test("#TC023 - get product reviews - with explicit pagination", async () => {
      await createMultipleReviews({
        count: 15,
        commonFields: { product: sampleProductId },
      });

      const limit = 5;
      const resPage1 = await request(app).get(
        `/reviews/product/${sampleProductId}?limit=${limit}&page=1`
      );
      expect(resPage1.status).toBe(200);
      expect(resPage1.body.reviews.length).toBe(limit);
      expect(resPage1.body.currentPage).toBe(1);
      expect(resPage1.body.totalPages).toBe(Math.ceil(15 / limit));
      expect(resPage1.body.totalReviews).toBe(15);

      const resPage2 = await request(app).get(
        `/reviews/product/${sampleProductId}?limit=${limit}&page=2`
      );
      expect(resPage2.status).toBe(200);
      expect(resPage2.body.reviews.length).toBe(limit);
      expect(resPage2.body.currentPage).toBe(2);
    });
  });

  describe("deleteProductReview Additional Tests", () => {
    test("#TC024 - delete review - review not found", async () => {
      const nonExistentReviewId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).delete(`/reviews/${nonExistentReviewId}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Review not found/i);
    });

    test("#TC025 - delete review - non-owner, non-admin", async () => {
      const ownerId = new mongoose.Types.ObjectId().toString(); // Different from sampleUserId
      const review = await createReview({ creator: ownerId });

      const nonOwnerNonAdminApp = createAppWithAuth({
        id: new mongoose.Types.ObjectId().toString(),
        isAdmin: false,
      });

      const res = await request(nonOwnerNonAdminApp).delete(
        `/reviews/${review._id}`
      );
      expect(res.status).toBe(403); // Or 401
      expect(res.body.message).toMatch(
        /You are not allowed to delete this review/i
      );
    });
  });

  describe("editReview Additional Tests", () => {
    test("#TC026 - update review - review not found", async () => {
      const nonExistentReviewId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .put(`/reviews/${nonExistentReviewId}`)
        .send({ comment: "Trying to update non-existent" });
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Review not found/i);
    });

    test("#TC027 - update review - non-owner, non-admin", async () => {
      const ownerId = new mongoose.Types.ObjectId().toString(); // Different from sampleUserId
      const review = await createReview({ creator: ownerId });

      const nonOwnerNonAdminApp = createAppWithAuth({
        id: new mongoose.Types.ObjectId().toString(),
        isAdmin: false,
      });

      const res = await request(nonOwnerNonAdminApp)
        .put(`/reviews/${review._id}`)
        .send({ comment: "Attempted unauthorized update" });
      expect(res.status).toBe(403); // Or 401
      expect(res.body.message).toMatch(
        /You are not allowed to edit this review/i
      );
    });

    test("#TC028 - update review - invalid rating", async () => {
      const review = await createReview({ creator: sampleUserId }); // sampleUser (admin in `app`) owns this
      const res = await request(app)
        .put(`/reviews/${review._id}`)
        .send({ rating: 7 }); // Invalid rating
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Rating must be between 1 and 5/i);
    });
  });

  describe("getUserReview Additional Tests", () => {
    test("#TC029 - get user reviews - user with no reviews (viewed by admin)", async () => {
      const userIdWithNoReviews = new mongoose.Types.ObjectId().toString();
      // `app` is already admin, can view anyone's reviews
      const res = await request(app).get(
        `/reviews/user/${userIdWithNoReviews}`
      );
      expect(res.status).toBe(200);
      expect(res.body.findUserReview).toEqual([]);
      // Optionally check for total/pagination info if applicable
      // expect(res.body.totalReviews).toBe(0);
    });
  });

  describe("replyReview Additional Tests", () => {
    test("#TC030 - reply review - review not found", async () => {
      const nonExistentReviewId = new mongoose.Types.ObjectId().toString();
      const res = await request(app) // app is admin
        .post(`/reviews/reply/${nonExistentReviewId}`)
        .send({ text: "Replying to non-existent review" });
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Review not found/i);
    });
  });

  describe("sortReviewStar Additional Tests", () => {
    test("#TC031 - sort by star - product with no reviews for that star rating", async () => {
      await createReview({ product: sampleProductId, rating: 1 });
      await createReview({ product: sampleProductId, rating: 2 });

      const res = await request(app).get(
        `/reviews/star/${sampleProductId}?star=5`
      ); // Query for 5-star
      expect(res.status).toBe(200);
      expect(res.body.reviews).toEqual([]);
      // Optionally, check total counts if your API returns it for filtered results
      // expect(res.body.totalMatchingReviews).toBe(0);
    });

    test("#TC032 - sort by star - missing star query parameter", async () => {
      const res = await request(app).get(`/reviews/star/${sampleProductId}`);
      expect(res.status).toBe(400); // Or different behavior if it defaults (e.g., to all stars)
      expect(res.body.message).toMatch("Invalid star rating"); // Or "Invalid star rating"
    });
  });

  describe("getReviewStatistic Additional Tests", () => {
    test("#TC033 - get review statistics - product with no reviews", async () => {
      const newProductIdNoStats = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(
        `/reviews/statistic/${newProductIdNoStats}`
      );
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.average).toBe(0); // Or null
      expect(res.body.ratingCounts).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }); // Or similar structure
    });
  });

  // --- NEW ADDITIONAL TEST CASES ---

  describe("createReview Additional Tests (Extended)", () => {
    test("#TC034 - create reviews for multiple products in single request", async () => {
      const productId1 = new mongoose.Types.ObjectId().toString();
      const productId2 = new mongoose.Types.ObjectId().toString();
      const orderId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post(`/reviews/${sampleUserId}`)
        .send({
          productIds: [productId1, productId2],
          order: orderId,
          rating: 4,
          comment: "Great products in this order",
        });

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2); // Two reviews created
      expect(res.body[0].product.toString()).toBe(productId1);
      expect(res.body[1].product.toString()).toBe(productId2);
    });

    test("#TC035 - reject review with extremely long comment", async () => {
      const res = await request(app)
        .post(`/reviews/${sampleUserId}`)
        .send({
          productIds: [sampleProductId],
          order: new mongoose.Types.ObjectId().toString(),
          rating: 4,
          comment: "a".repeat(2001), // Assuming max length is 2000 chars
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Comment exceeds maximum length/i);
    });

    test("#TC036 - prevent duplicate reviews for same product by same user", async () => {
      // First create a review
      const orderId = new mongoose.Types.ObjectId().toString();
      await request(app)
        .post(`/reviews/${sampleUserId}`)
        .send({
          productIds: [sampleProductId],
          order: orderId,
          rating: 4,
          comment: "First review",
        });

      // Try to create another review for same product
      const res = await request(app)
        .post(`/reviews/${sampleUserId}`)
        .send({
          productIds: [sampleProductId],
          order: new mongoose.Types.ObjectId().toString(),
          rating: 5,
          comment: "Second review",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already reviewed this product/i);
    });
  });

  describe("getProductReview Additional Tests (Extended)", () => {
    test("#TC037 - get product reviews with invalid pagination parameters", async () => {
      await createMultipleReviews({
        count: 10,
        commonFields: { product: sampleProductId },
      });

      const res = await request(app).get(
        `/reviews/product/${sampleProductId}?page=-1&limit=0`
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid pagination parameters/i);
    });

    test("#TC038 - get product reviews sorted by newest", async () => {
      // Create reviews with different timestamps
      const review1 = await createReview({
        product: sampleProductId,
        createdAt: new Date(Date.now() - 30000), // 30 seconds ago
      });

      const review2 = await createReview({
        product: sampleProductId,
        createdAt: new Date(), // now
      });

      const res = await request(app).get(
        `/reviews/product/${sampleProductId}?sort=newest`
      );

      expect(res.status).toBe(200);
      expect(res.body.reviews[0]._id.toString()).toBe(review2._id.toString());
      expect(res.body.reviews[1]._id.toString()).toBe(review1._id.toString());
    });
  });

  describe("editReview Additional Tests (Extended)", () => {
    test("#TC039 - partial update of review", async () => {
      const review = await createReview({
        creator: sampleUserId,
        rating: 3,
        comment: "Original comment",
      });

      // Only update the rating
      const res = await request(app)
        .put(`/reviews/${review._id}`)
        .send({ rating: 5 });

      expect(res.status).toBe(200);
      expect(res.body.rating).toBe(5);
      expect(res.body.comment).toBe("Original comment"); // Comment unchanged
    });

    test("#TC040 - time-limited review updates", async () => {
      // Create a review with creation date more than 48 hours ago
      // (assuming there's a 48-hour edit window)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 3); // 3 days old

      const review = await createReview({
        creator: sampleUserId,
        createdAt: oldDate,
      });

      const res = await request(app)
        .put(`/reviews/${review._id}`)
        .send({ comment: "Attempted late update" });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/cannot edit reviews older than/i);
    });
  });

  describe("replyReview Additional Tests (Extended)", () => {
    test("#TC041 - update existing reply", async () => {
      // Create review with a reply
      const review = await createReview();
      await request(app)
        .post(`/reviews/reply/${review._id}`)
        .send({ text: "Updaetd reply" });

      // Update the reply
      const res = await request(app)
        .post(`/reviews/reply/${review._id}`)
        .send({ text: "Initial reply" });

      expect(res.status).toBe(200);
      expect(res.body.reply[0].text).toBe("Updated reply");
      expect(res.body.reply.length).toBe(1); // Only one reply, not two
    });

    test("#TC042 - reject reply with extremely long text", async () => {
      const review = await createReview();

      const res = await request(app)
        .post(`/reviews/reply/${review._id}`)
        .send({ text: "a".repeat(1001) }); // Assuming max reply length is 1000

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Reply text exceeds maximum length/i);
    });
  });

  describe("sortReviewStar Additional Tests (Extended)", () => {
    test("#TC043 - sort reviews by multiple star values", async () => {
      // Create reviews with different star ratings
      await createMultipleReviews({
        count: 10,
        commonFields: { product: sampleProductId },
      });

      const res = await request(app).get(
        `/reviews/star/${sampleProductId}?star=4,5`
      );

      expect(res.status).toBe(200);
      expect(res.body.reviews.length).toBeGreaterThan(0);
      // Verify all reviews have either 4 or 5 stars
      res.body.reviews.forEach((review) => {
        expect([4, 5]).toContain(review.rating);
      });
    });

    test("#TC044 - filter reviews with images only", async () => {
      // Create reviews with and without images
      await createReview({
        product: sampleProductId,
        image: "image1.jpg",
      });

      await createReview({
        product: sampleProductId,
        image: null,
      });

      const res = await request(app).get(
        `/reviews/star/${sampleProductId}?hasImages=true`
      );

      expect(res.status).toBe(200);
      expect(res.body.reviews.length).toBe(1);
      expect(res.body.reviews[0].image).toBeTruthy();
    });
  });

  describe("getReviewStatistic Additional Tests (Extended)", () => {
    test("#TC045 - get review statistics within date range", async () => {
      // Create reviews with different dates
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 2);

      await createReview({
        product: sampleProductId,
        createdAt: oldDate, // 2 months old
        rating: 2,
      });

      await createReview({
        product: sampleProductId,
        createdAt: new Date(), // current
        rating: 5,
      });

      // Get stats for last month only
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const res = await request(app).get(
        `/reviews/statistic/${sampleProductId}?from=${lastMonth.toISOString()}`
      );

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1); // Only the recent review
      expect(res.body.average).toBe(5);
    });
  });
});
