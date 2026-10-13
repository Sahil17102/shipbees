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
const client_1 = require("../models/client");
const users_1 = require("../models/schema/users");
const userProfile_1 = require("../models/schema/userProfile");
const drizzle_orm_1 = require("drizzle-orm");
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
async function createDummyMerchant() {
    try {
        console.log('🚀 Creating dummy merchant user...');
        const email = 'merchant@shipray.local';
        const phone = '+919876543210';
        // Check if user already exists
        const existingUser = await client_1.db.query.users.findFirst({
            where: (0, drizzle_orm_1.eq)(users_1.users.email, email),
        });
        let userId = existingUser?.id;
        if (existingUser) {
            console.log('⚠️  Merchant user already exists. Updating...');
            await client_1.db
                .update(users_1.users)
                .set({
                emailVerified: true,
                phoneVerified: true,
                accountVerified: true,
                phone,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(users_1.users.id, existingUser.id));
            console.log('✓ Merchant user updated');
        }
        else {
            // Create new merchant user
            const newUser = await client_1.db
                .insert(users_1.users)
                .values({
                email,
                phone,
                emailVerified: true,
                phoneVerified: true,
                accountVerified: true,
                role: 'customer',
            })
                .returning();
            userId = newUser[0].id;
            console.log('✓ Merchant user created:', userId);
        }
        // Check if profile exists
        const existingProfile = await client_1.db.query.userProfiles.findFirst({
            where: (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId),
        });
        if (existingProfile) {
            console.log('⚠️  Profile already exists. Updating...');
            await client_1.db
                .update(userProfile_1.userProfiles)
                .set({
                companyInfo: {
                    businessName: 'Test Merchant Store',
                    contactPerson: 'John Merchant',
                    POCEmailVerified: true,
                    POCPhoneVerified: true,
                    companyAddress: '123 Business Street, Mumbai',
                    pincode: '400001',
                    state: 'Maharashtra',
                    city: 'Mumbai',
                    contactNumber: '+919876543210',
                    contactEmail: 'merchant@shipray.local',
                    companyContactNumber: '+919876543210',
                    brandName: 'Test Store',
                    companyEmail: 'merchant@shipray.local',
                    website: 'https://teststore.local',
                },
                businessType: ['b2c'],
                approved: true,
                onboardingComplete: true,
                profileComplete: true,
                approvedAt: new Date(),
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId));
            console.log('✓ Merchant profile updated');
        }
        else {
            // Create user profile with approved and onboarding complete
            await client_1.db
                .insert(userProfile_1.userProfiles)
                .values({
                userId: userId,
                companyInfo: {
                    businessName: 'Test Merchant Store',
                    contactPerson: 'John Merchant',
                    POCEmailVerified: true,
                    POCPhoneVerified: true,
                    companyAddress: '123 Business Street, Mumbai',
                    pincode: '400001',
                    state: 'Maharashtra',
                    city: 'Mumbai',
                    contactNumber: '+919876543210',
                    contactEmail: 'merchant@shipray.local',
                    companyContactNumber: '+919876543210',
                    brandName: 'Test Store',
                    companyEmail: 'merchant@shipray.local',
                    website: 'https://teststore.local',
                },
                businessType: ['b2c'],
                approved: true,
                onboardingComplete: true,
                profileComplete: true,
                approvedAt: new Date(),
            })
                .returning();
            console.log('✓ Merchant profile created with approved=true, onboardingComplete=true');
        }
        console.log('\n✅ Dummy merchant setup complete!');
        console.log('\n📊 MERCHANT LOGIN (OTP Flow):');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email: merchant@shipray.local');
        console.log('📱 Phone: +919876543210');
        console.log('🔐 OTP: Any 6-digit number (validation disabled in dev)');
        console.log('   Example: 123456');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n✨ Account Status:');
        console.log('   ✅ Email Verified');
        console.log('   ✅ Phone Verified');
        console.log('   ✅ Account Verified');
        console.log('   ✅ KYC: Done (approved=true)');
        console.log('   ✅ Onboarding: Complete');
        console.log('   ✅ Profile: Complete');
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Error creating dummy merchant:', error);
        process.exit(1);
    }
}
createDummyMerchant();
