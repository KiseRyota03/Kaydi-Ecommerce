import jwt from "jsonwebtoken";
import { errorHandler } from "../../utils/error";
import { verifyToken } from "../../utils/verifyUser";
jest.mock("jsonwebtoken");
jest.mock("../../utils/error");

describe("verifyToken middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      cookies: {},
    };
    res = {};
    next = jest.fn();
  });

  it("should call next with 401 error if no token is present", () => {
    const mockError = new Error("Unauthorized");
    errorHandler.mockReturnValue(mockError);

    verifyToken(req, res, next);

    expect(errorHandler).toHaveBeenCalledWith(401, "Unauthorized");
    expect(next).toHaveBeenCalledWith(mockError);
  });

  it("should call next with 401 error if token is invalid", () => {
    req.cookies.access_token = "invalid-token";
    const mockError = new Error("Unauthorized");
    errorHandler.mockReturnValue(mockError);

    jwt.verify.mockImplementation((token, secret, callback) => {
      callback(new Error("Invalid token"), null);
    });

    verifyToken(req, res, next);

    expect(jwt.verify).toHaveBeenCalled();
    expect(errorHandler).toHaveBeenCalledWith(401, "Unauthorized");
    expect(next).toHaveBeenCalledWith(mockError);
  });

  it("should set req.user and call next if token is valid", () => {
    req.cookies.access_token = "valid-token";
    const fakeUser = { id: "123", role: "user" };

    jwt.verify.mockImplementation((token, secret, callback) => {
      callback(null, fakeUser);
    });

    verifyToken(req, res, next);

    expect(jwt.verify).toHaveBeenCalled();
    expect(req.user).toEqual(fakeUser);
    expect(next).toHaveBeenCalledWith();
  });
});
