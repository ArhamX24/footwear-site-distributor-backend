import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import userModel from '../../Models/user.model.js';

let cookieOption = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    // sameSite: 'lax',
};

let statusCodes = {
    success: 200,
    noContent:204,
    badRequest: 400,
    unauthorized: 403,
    notFound: 404,
    serverError: 500,
    forbidden: 402
}


// ✅ FIXED: login function with better debugging
const login = async (req, res) => {
    try {
        const { phoneNo, password } = req.body;

        if (!phoneNo || !password) {
            return res.status(statusCodes.badRequest).json({ 
                result: false, 
                message: "Phone number and password are required" 
            });
        }

        // Find user by phone number
        const user = await userModel.findOne({ phoneNo });
        
        if (!user) {
            return res.status(statusCodes.notFound).json({ 
                result: false, 
                message: "Account not found" 
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(statusCodes.unauthorized).json({ 
                result: false, 
                message: "Account is deactivated. Contact administrator." 
            });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(statusCodes.unauthorized).json({ 
                result: false, 
                message: "Incorrect password" 
            });
        }

        // Generate tokens
        const accessToken = jwt.sign(
            { 
                _id: user._id, 
                phoneNo: user.phoneNo, 
                role: user.role,
                name: user.name 
            },
            process.env.ACCESS_JWT_SECRET,
            { expiresIn: process.env.ACCESS_JWT_EXPIRY }
        );

        const refreshToken = jwt.sign(
            { 
                _id: user._id, 
                role: user.role 
            },
            process.env.REFRESH_JWT_SECRET,
            { expiresIn: process.env.REFRESH_JWT_EXPIRY }
        );

        // Update last login
        await userModel.updateOne(
            { _id: user._id }, 
            { 
                $set: { 
                    refreshToken,
                    lastLogin: new Date() 
                }
            }
        );

        // Set cookies
        const cookieOption = {
            path: "/",
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
        };

        res.cookie("accessToken", accessToken, cookieOption);
        res.cookie("refreshToken", refreshToken, cookieOption);

        return res.status(statusCodes.success).json({ 
            result: true, 
            message: "Login successful",
            role: user.role,  // ✅ Add this for frontend compatibility
            data: {
                role: user.role,
                name: user.name
            }
        });

    } catch (error) {
        return res.status(statusCodes.serverError).json({ 
            result: false, 
            message: "Login failed. Please try again." 
        });
    }
};

const createNewRefreshToken = async (req, res) => {
    try {
        const existingRefreshToken = req.cookies.refreshToken;

        if (!existingRefreshToken) {
            return res.status(statusCodes.unauthorized).json({ 
                result: false, 
                message: "Refresh token required" 
            });
        }

        const decodedToken = jwt.verify(existingRefreshToken, process.env.REFRESH_JWT_SECRET);
        const user = await userModel.findById(decodedToken._id);

        if (!user || !user.isActive) {
            return res.status(statusCodes.unauthorized).json({ 
                result: false, 
                message: "User not found or inactive" 
            });
        }

        // Generate new access token
        const accessToken = jwt.sign(
            { 
                _id: user._id, 
                phoneNo: user.phoneNo, 
                role: user.role,
                name: user.name 
            },
            process.env.ACCESS_JWT_SECRET,
            { expiresIn: process.env.ACCESS_JWT_EXPIRY }
        );

        return res.status(statusCodes.success)
            .cookie("accessToken", accessToken, cookieOption)
            .json({ result: true, message: "Access token refreshed" });

    } catch (error) {
        console.error('Token refresh error:', error);
        return res.status(statusCodes.unauthorized).json({ 
            result: false, 
            message: "Invalid refresh token" 
        });
    }
};

const getMe = async (req, res) => {
    try {
        const user = await userModel.findById(req.user._id).select('-password -refreshToken');

        if (!user || !user.isActive) {
            return res.status(statusCodes.notFound).json({ 
                result: false, 
                message: "User not found" 
            });
        }

        return res.status(statusCodes.success).json({ 
            result: true, 
            message: "User data retrieved", 
            data: user
        });

    } catch (error) {
        return res.status(statusCodes.serverError).json({ 
            result: false, 
            message: "Error retrieving user data" 
        });
    }
};

const logout = async (req, res) => {
    try {
        // Clear refresh token from database
        if (req.user?._id) {
            await userModel.updateOne(
                { _id: req.user._id }, 
                { $unset: { refreshToken: 1 } }
            );
        }

        // Clear cookies
        res.clearCookie("accessToken", cookieOption);
        res.clearCookie("refreshToken", cookieOption);
        
        return res.status(statusCodes.success).json({ 
            result: true, 
            message: "Logged out successfully" 
        });
    } catch (error) {
        return res.status(statusCodes.serverError).json({ 
            result: false, 
            message: "Logout failed" 
        });
    }
};

export { login, createNewRefreshToken, getMe, logout };
