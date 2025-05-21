import { errorHandler } from "../../utils/error"; // adjust path if needed

describe("errorHandler", () => {
  it("should return an Error object with the correct statusCode and message", () => {
    const statusCode = 404;
    const message = "Resource not found";

    const error = errorHandler(statusCode, message);

    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(statusCode);
    expect(error.message).toBe(message);
  });

  it("should create a new error object each time", () => {
    const error1 = errorHandler(400, "Bad request");
    const error2 = errorHandler(500, "Server error");

    expect(error1).not.toBe(error2);
    expect(error1.message).toBe("Bad request");
    expect(error2.message).toBe("Server error");
  });
});
