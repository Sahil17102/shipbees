"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("../models/client");
const users_1 = require("../models/schema/users");
const userProfile_1 = require("../models/schema/userProfile");
const drizzle_orm_1 = require("drizzle-orm");
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
async function createDummyAdmin() {
    try {
        console.log('🚀 Creating dummy admin user...');
        const email = 'admin@shipray.local';
        const password = 'Admin@12345';
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        // Check if user already exists
        const existingUser = await client_1.db.query.users.findFirst({
            where: (0, drizzle_orm_1.eq)(users_1.users.email, email),
        });
        if (existingUser) {
            console.log('⚠️  Admin user already exists. Updating...');
            await client_1.db
                .update(users_1.users)
                .set({
                passwordHash: hashedPassword,
                emailVerified: true,
                phoneVerified: true,
                accountVerified: true,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(users_1.users.id, existingUser.id));
            console.log('✓ Admin password updated');
        }
        else {
            // Create new admin user
            const newUser = await client_1.db
                .insert(users_1.users)
                .values({
                email,
                passwordHash: hashedPassword,
                emailVerified: true,
                phoneVerified: true,
                accountVerified: true,
                role: 'admin',
            })
                .returning();
            console.log('✓ Admin user created:', newUser[0].id);
            // Create user profile with approved and onboarding complete
            await client_1.db
                .insert(userProfile_1.userProfiles)
                .values({
                userId: newUser[0].id,
                companyInfo: {
                    businessName: 'Test Company',
                    contactPerson: 'Admin User',
                    POCEmailVerified: true,
                    POCPhoneVerified: true,
                    companyAddress: '123 Test Street',
                    pincode: '110001',
                    state: 'Delhi',
                    city: 'New Delhi',
                    contactNumber: '+919876543210',
                    contactEmail: 'admin@shipray.local',
                    companyContactNumber: '+919876543210',
                    brandName: 'Test Brand',
                    companyEmail: 'admin@shipray.local',
                    website: 'https://shipray.local',
                },
                businessType: ['b2c'],
                approved: true,
                onboardingComplete: true,
                profileComplete: true,
                approvedAt: new Date(),
            })
                .returning();
            console.log('✓ User profile created with approved=true, onboardingComplete=true');
        }
        console.log('\n✅ Dummy admin setup complete!');
        console.log('📧 Email: admin@shipray.local');
        console.log('🔐 Password: Admin@12345');
        console.log('\nYou can now login to the admin panel with these credentials.');
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Error creating dummy admin:', error);
        process.exit(1);
    }
}
createDummyAdmin();
