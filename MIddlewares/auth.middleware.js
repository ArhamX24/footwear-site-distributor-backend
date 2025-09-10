// middleware/auth.js
import jwt from 'jsonwebtoken'; // ✅ Added missing import

let statusCodes = {
    success: 200,
    noContent:204,
    badRequest: 400,
    unauthorized: 403,
    notFound: 404,
    serverError: 500,
    forbidden: 402
}


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
