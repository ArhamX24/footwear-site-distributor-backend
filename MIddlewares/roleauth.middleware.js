// middleware/roleAuth.js
import jwt from 'jsonwebtoken';
import userModel from '../Models/user.model.js';

let statusCodes = {
    success: 200,
    noContent:204,
    badRequest: 400,
    unauthorized: 403,
    notFound: 404,
    serverError: 500,
    forbidden: 402
}

// ✅ Flexible role authorization
export const authorizeRoles = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            const token = req?.cookies?.accessToken;
            
            if (!token) {
                return res.status(statusCodes.unauthorized).json({ 
                    result: false, 
                    message: "Access token required" 
                });
            }

            const decodedToken = jwt.verify(token, process.env.ACCESS_JWT_SECRET);
            
            // Check if user role is allowed
            if (!allowedRoles.includes(decodedToken.role)) {
                return res.status(statusCodes.forbidden).json({ 
                    result: false, 
                    message: `Access denied. Required roles: ${allowedRoles.join(', ')}` 
                });
            }

            // Fetch user data and attach to request
            const user = await userModel.findById(decodedToken._id).select('-password');
            
            if (!user || !user.isActive) {
                return res.status(statusCodes.unauthorized).json({ 
                    result: false, 
                    message: "User not found or inactive" 
                });
            }

            req.user = user;
            next();

        } catch (error) {            
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    result: false, 
                    message: "Token expired" 
                });
            }
            return res.status(statusCodes.unauthorized).json({ 
                result: false, 
                message: "Invalid token" 
            });
        }
    };
};

// ✅ Convenience functions for specific roles
export const adminOnly = authorizeRoles(['admin']);
export const distributorOnly = authorizeRoles(['distributor']);
export const contractorOnly = authorizeRoles(['contractor']);
export const warehouseOnly = authorizeRoles(['warehouse_inspector']);
export const shipmentOnly = authorizeRoles(['shipment_manager']);

// ✅ Combined role access
export const warehouseAndShipment = authorizeRoles(['warehouse_inspector', 'shipment_manager']);
export const adminAndContractor = authorizeRoles(['admin', 'contractor']);
