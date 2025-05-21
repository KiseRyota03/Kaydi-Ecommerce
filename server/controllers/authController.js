import User from "../models/userModel.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

export const signUp = async (req, res, next) => {
  const { username, email, password } = req.body;

  if (!email || !password || email === "" || password === "") {
    return res.status(401).json({ message: "All fields are required" });
  }

  if (!username || username.trim().length < 2 || username.trim().length > 50) {
    return res
      .status(400)
      .json({ message: "Username must be between 2 and 50 characters" });
  }

  if (password.length < 6 || password.length > 20) {
    return res
      .status(400)
      .json({ message: "Password must be between 6 and 20 characters" });
  }

  const existedUser = await User.findOne({ email });
  if (existedUser) {
    return res.status(400).json({ message: "Email already exists" });
  }

  const hashedPassword = bcryptjs.hashSync(password, 10);

  const newUser = new User({
    username,
    email,
    password: hashedPassword,
  });

  try {
    await newUser.save();
    res.status(200).json({
      message: "User registered successfully",
      newUser,
    });
  } catch (error) {
    next(error);
  }
};

export const signIn = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password || email === "" || password === "") {
    return res.status(401).json({ message: "All fields are required" });
  }

  try {
    const validUser = await User.findOne({ email });
    if (!validUser) {
      return res.status(401).json({ message: "User not found" });
    }
    const validPassword = bcryptjs.compareSync(password, validUser.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Generate Access Token
    const accessToken = jwt.sign(
      {
        id: validUser._id,
        username: validUser.username,
        isAdmin: validUser.isAdmin,
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    // Generate Refresh Token
    const refreshToken = jwt.sign(
      {
        id: validUser._id,
        username: validUser.username,
        isAdmin: validUser.isAdmin,
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "1d" }
    );

    const { password: past, ...rest } = validUser._doc;

    const isProduction = process.env.NODE_ENV === "production";

    res
      .status(200)
      .cookie("access_token", accessToken, {
        httpOnly: true,
        secure: isProduction, //true trong production, false trong localhost
        sameSite: isProduction ? "None" : "Lax", // SameSite=None only in production
      })
      .cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: isProduction, //true trong production, false trong localhost
        sameSite: isProduction ? "None" : "Lax", // SameSite=None only in production
      })
      .json(rest);
  } catch (error) {
    console.error("🔥 signIn error:", error); // Add this line
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const signOut = async (req, res, next) => {
  try {
    res
      .clearCookie("access_token")
      .clearCookie("refresh_token")
      .status(200)
      .json({
        message: "User signed out successfully",
      });
  } catch (error) {
    next(error);
  }
};

export const google = async (req, res, next) => {
  const { email, name, photo } = req.body;

  try {
    const user = await User.findOne({ email });
    if (user) {
      // Generate Access Token
      const accessToken = jwt.sign(
        {
          id: user._id,
          username: user.username,
          isAdmin: user.isAdmin,
        },
        process.env.JWT_SECRET,
        { expiresIn: "12h" }
      );

      // Generate Refresh Token
      const refreshToken = jwt.sign(
        {
          id: user._id,
          username: user.username,
          isAdmin: user.isAdmin,
        },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "1d" }
      );

      const { password: pass, ...rest } = user._doc;
      const isProduction = process.env.NODE_ENV === "production";

      res
        .status(200)
        .cookie("access_token", accessToken, {
          httpOnly: true,
          secure: isProduction, // true trong production, false trong localhost
          sameSite: isProduction ? "None" : "Lax", // SameSite=None only in production
        })
        .cookie("refresh_token", refreshToken, {
          httpOnly: true,
          secure: isProduction, // true trong production, false trong localhost
          sameSite: isProduction ? "None" : "Lax", // SameSite=None only in production
        })
        .json(rest);
    } else {
      const generatedPassword =
        Math.random().toString(36).slice(-8) +
        Math.random().toString(36).slice(-8);
      const hashedPassword = bcryptjs.hashSync(generatedPassword, 10);

      const newUser = new User({
        username:
          name.toLowerCase().split(" ").join("") +
          Math.random().toString(9).slice(-4),
        email,
        password: hashedPassword,
        profilePic: photo,
      });

      await newUser.save();

      // Generate Access Token
      const accessToken = jwt.sign(
        {
          id: newUser._id,
          username: newUser.username,
          isAdmin: newUser.isAdmin,
        },
        process.env.JWT_SECRET,
        { expiresIn: "12h" }
      );

      // Generate Refresh Token
      const refreshToken = jwt.sign(
        {
          id: newUser._id,
          username: newUser.username,
          isAdmin: newUser.isAdmin,
        },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "1d" }
      );

      const { password: pass, ...rest } = newUser._doc;

      res
        .status(200)
        .cookie("access_token", accessToken, {
          httpOnly: true,
          secure: isProduction, // true trong production, false trong localhost
          sameSite: isProduction ? "None" : "Lax", // SameSite=None only in production
        })
        .cookie("refresh_token", refreshToken, {
          httpOnly: true,
          secure: isProduction, // true trong production, false trong localhost
          sameSite: isProduction ? "None" : "Lax", // SameSite=None only in production
        })
        .json(rest);
    }
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  const token = req.cookies.refresh_token;
  if (!token) {
    return res.status(404).json({ message: "Refresh token is missing" });
  }

  jwt.verify(token, process.env.JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
      return res.status(404).json({ message: "Invalid refresh token" });
    }

    // Generate a new access token
    const newAccessToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    res.cookie("access_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(200).json({ message: "Token refreshed successfully" });
  });
};

export const forgotPassword = async (req, res, next) => {
  const { email } = req.body;

  if (!email || email === "") {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const findUser = await User.findOne({ email });
    if (!findUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    findUser.resetPasswordToken = hashedToken;
    findUser.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await findUser.save();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const resetLink = `http://localhost:5173/newPassword/${resetToken}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: findUser.email,
      subject: "Password Reset Request",
      text: `Click the link to reset your password: ${resetLink}`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      message: "Password reset email sent successfully. Check your inbox.",
    });
  } catch (error) {
    console.error("Error in forgotPassword:", error);
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  if (!token || !newPassword || newPassword === "") {
    return res
      .status(400)
      .json({ message: "Token and new password are required" });
  }

  try {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const findUser = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!findUser) {
      return res.status(404).json({ message: "Invalid token or expired" });
    }

    const hashedPassword = bcryptjs.hashSync(newPassword, 10);
    findUser.password = hashedPassword;
    findUser.resetPasswordToken = null;
    findUser.resetPasswordExpires = null;

    await findUser.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    next(error);
  }
};
