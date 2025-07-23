const express = require('express');
const cors = require('cors');
require('dotenv').config(); // .env ফাইল লোড করা হচ্ছে সবার আগে
const app = express();
const port = process.env.PORT || 3000;


const admin = require("firebase-admin");

// --- Firebase Admin SDK ইনিশিয়ালাইজেশন: ত্রুটি হ্যান্ডলিং সহ ---
try {
    // process.env.FB_SERVICE_KEY ভেরিয়েবল থেকে Base64 এনকোডেড স্ট্রিং ডিকোড করা হচ্ছে
    const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
    // ডিকোড করা স্ট্রিংটিকে JSON অবজেক্টে পার্স করা হচ্ছে
    const serviceAccount = JSON.parse(decoded);

    // Firebase Admin SDK ইনিশিয়ালাইজ করা হচ্ছে
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK সফলভাবে ইনিশিয়ালাইজ হয়েছে।"); // সফলতার বার্তা
} catch (error) {
    // ইনিশিয়ালাইজেশন ব্যর্থ হলে ত্রুটি লগ করা হচ্ছে
    console.error("Firebase Admin SDK ইনিশিয়ালাইজেশন ব্যর্থ হয়েছে:", error.message);
    // Vercel-এর লগ দেখতে এটি বিশেষভাবে সহায়ক হবে।
    // নিরাপত্তার জন্য FB_SERVICE_KEY এর সম্পূর্ণ মান লগ করবেন না।
}
// -----------------------------------------------------------------


const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require("mongodb");


// Express মিডলওয়্যার সেটআপ
app.use(cors()); // CORS সক্ষম করা হচ্ছে
app.use(express.json()); // JSON বডি পার্স করার জন্য


// MongoDB সংযোগ URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@nexus0.ytaptl9.mongodb.net/?retryWrites=true&w=majority&appName=Nexus0`;


// MongoDB ক্লায়েন্ট তৈরি করা হচ্ছে
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


// Firebase টোকেন যাচাই করার জন্য মিডলওয়্যার ফাংশন
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers?.authorization;

    if(!authHeader || !authHeader.startsWith('Bearer ')){
        return res.status(401).send({message : 'unauthorization access' })
    }
    const token = authHeader.split(' ')[1];

    try{
        const decodedToken = await admin.auth().verifyIdToken(token) // 'decoded' নামটি পরিবর্তন করা হয়েছে যাতে উপরের 'decoded' এর সাথে কনফ্লিক্ট না করে
        console.log('decoded token', decodedToken)
        req.decoded = decodedToken;
        next();
    }
    catch(error){
        return res.status(401).send({message : 'unauthorization access' })
    }
}

// মূল ফাংশন যেখানে MongoDB সংযোগ এবং Express রুটগুলো সংজ্ঞায়িত করা হয়েছে
async function run() {
    try {
        // MongoDB এর সাথে সংযোগ স্থাপন
        await client.connect();

        // MongoDB কালেকশনগুলো ডেফাইন করা হচ্ছে
        const foodCollection = client.db("share_meal").collection('foods');
        const usersCollection = client.db("share_meal").collection('users');
        const foodRequestsCollection = client.db("share_meal").collection('foodRequests');

        // --- API এন্ডপয়েন্টগুলো ---

        // সব খাবার আনা অথবা ইমেইল দ্বারা ফিল্টার করা
        app.get('/foods', async (req, res) => {
            const email = req.query.email;
            let query = {};
            if (email) {
                query = { donorEmail: email };
            }

            const cursor = foodCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        // নতুন খাবার যোগ করা
        app.post('/foods', async (req, res) => {
            const foodData = req.body;
            try {
                const result = await foodCollection.insertOne(foodData);
                res.status(201).send(result);
            } catch (err) {
                console.error("Failed to add food:", err);
                res.status(500).send({ error: "Failed to add food." });
            }
        });

        // আইডি দ্বারা খাবার আপডেট করা
        app.put('/foods/:id', async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            try {
                const result = await foodCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedData }
                );
                if (result.modifiedCount > 0) {
                    res.send({ message: 'Food updated successfully' });
                } else {
                    res.status(404).send({ message: 'Food not found' });
                }
            } catch (error) {
                res.status(500).send({ error: 'Failed to update food' });
            }
        });

        // আইডি দ্বারা খাবার মুছে ফেলা
        app.delete('/foods/:id', async (req, res) => {
            const id = req.params.id;

            try {
                const result = await foodCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount > 0) {
                    res.send({ message: 'Food deleted successfully' });
                } else {
                    res.status(404).send({ message: 'Food not found' });
                }
            } catch (error) {
                res.status(500).send({ error: 'Failed to delete food' });
            }
        });

        // আইডি দ্বারা একটি নির্দিষ্ট খাবার আনা
        app.get('/foods/:id', async (req, res) => {
            const id = req.params.id;

            try {
                const food = await foodCollection.findOne({ _id: new ObjectId(id) });
                if (food) {
                    res.send(food);
                } else {
                    res.status(404).send({ message: "Food not found" });
                }
            } catch (error) {
                res.status(500).send({ error: "Failed to get food" });
            }
        });

        // খাবারের অনুরোধ তৈরি করা
        app.post('/food-requests', async (req, res) => {
            const requestData = req.body;
            try {
                const result = await foodRequestsCollection.insertOne(requestData);

                // খাবারের স্ট্যাটাস 'requested' এ আপডেট করা
                const updateResult = await foodCollection.updateOne(
                    { _id: new ObjectId(requestData.foodId) },
                    { $set: { foodStatus: "requested" } }
                );

                res.status(201).send({ message: "Request created and food status updated" });
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: "Failed to create food request" });
            }
        });

        // ব্যবহারকারীর ইমেইল দ্বারা খাবারের অনুরোধগুলো আনা (Firebase টোকেন যাচাই সহ)
        app.get('/food-requests', verifyFirebaseToken, async (req, res) => {
            const userEmail = req.query.userEmail;

            if (!userEmail) {
                return res.status(400).send({ error: "User email required" });
            }

            // অনুরোধকারীর ইমেইল Firebase টোকেনের ইমেইলের সাথে মিলে যাচ্ছে কিনা যাচাই করা
            if (userEmail !== req.decoded.email) {
                return res.status(403).send({ message: "Forbidden access" });
            }

            try {
                const requests = await foodRequestsCollection.find({ userEmail }).toArray();
                res.send(requests);
            } catch (error) {
                res.status(500).send({ error: "Failed to fetch food requests" });
            }
        });

        // নতুন ব্যবহারকারী যোগ করা
        app.post('/users', async (req, res) => {
            const userProfile = req.body;
            const result = await usersCollection.insertOne(userProfile);
            res.send(result);
        })

        // MongoDB সংযোগ সফল হয়েছে কিনা তা নিশ্চিত করতে পিং করা
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // এই অংশে সাধারণত ক্লায়েন্ট বন্ধ করার কোড থাকে,
        // কিন্তু Vercel সার্ভারলেস ফাংশনে এটি স্বয়ংক্রিয়ভাবে হ্যান্ডেল হয়।
        // await client.close();
    }
}

// run() ফাংশন কল করা এবং কোনো ত্রুটি হলে তা কনসোল করা
run().catch(console.dir);


// রুট ডিরেক্টরি ('/') এর জন্য সাধারণ রেসপন্স
app.get('/', (req, res) => {
    res.send('Share Meal is testing!')
})

// Vercel-এর জন্য Express অ্যাপ এক্সপোর্ট করা হচ্ছে (app.listen এর প্রয়োজন নেই)
module.exports = app;