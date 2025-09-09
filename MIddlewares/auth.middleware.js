// middleware/auth.js
import jwt from 'jsonwebtoken'; // ✅ Added missing import
import statusCodes from '../Utils/statuscodes.js';

const authenticateToken = (req, res, next) => {
    const token = req?.cookies?.accessToken;
    
    if (!token) {
        return res.status(statusCodes.unauthorized).json({ 
            result: false, 
            message: "Access token required" 
        });
    }

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_JWT_SECRET);
        req.user = decodedToken;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(statusCodes.unauthorized).json({ 
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

export default authenticateToken;
