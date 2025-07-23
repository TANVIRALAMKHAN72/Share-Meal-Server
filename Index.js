const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
require('dotenv').config(); 

const app = express();
const port = process.env.PORT || 3000;


try {
    const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decoded);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    console.error("Firebase Admin SDK initialization failed:", error);
   
}


const allowedOrigins = [
    'https://poetic-clafoutis-252a8a.netlify.app',
    'http://localhost:5173', 
    'http://localhost:3000'  
];

const corsOptions = {
    origin: function (origin, callback) {
        
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, 
    optionsSuccessStatus: 200 
};

app.use(cors(corsOptions));

app.use(express.json()); 

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@nexus0.ytaptl9.mongodb.net/?retryWrites=true&w=majority&appName=Nexus0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const database = client.db("shareMeal");
        const foodsCollection = database.collection("foods");
        const foodRequestsCollection = database.collection("foodRequests");

        async function verifyFirebaseToken(req, res, next) {
            const idToken = req.headers.authorization?.split(' ')[1];

            if (!idToken) {
                return res.status(401).send({ message: 'Unauthorized access: No token provided' });
            }

            try {
                const decodedToken = await admin.auth().verifyIdToken(idToken);
                req.decodedUser = decodedToken;
                next();
            } catch (error) {
                console.error("Error verifying Firebase token:", error);
                return res.status(401).send({ message: 'Unauthorized access: Invalid token' });
            }
        }


        app.get('/foods', async (req, res) => {
            try {
                const query = {};
                const result = await foodsCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching foods:", error);
                res.status(500).send({ message: "Failed to fetch foods" });
            }
        });

        app.get('/foods/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const result = await foodsCollection.findOne(query);
                if (result) {
                    res.send(result);
                } else {
                    res.status(404).send({ message: "Food not found" });
                }
            } catch (error) {
                console.error("Error fetching single food:", error);
                res.status(500).send({ message: "Failed to fetch food" });
            }
        });

        app.get('/foods-by-email', verifyFirebaseToken, async (req, res) => {
            const requestedEmail = req.query.email;
            const decodedEmail = req.decodedUser.email;

            if (requestedEmail !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden access: Email mismatch' });
            }

            try {
                const query = { 'donator.email': requestedEmail };
                const result = await foodsCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching foods by email:", error);
                res.status(500).send({ message: "Failed to fetch foods by email" });
            }
        });

        app.post('/foods', verifyFirebaseToken, async (req, res) => {
            const newFood = req.body;
            const decodedEmail = req.decodedUser.email;

            if (newFood.donator && newFood.donator.email !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden access: Donator email mismatch' });
            }

            try {
                const result = await foodsCollection.insertOne(newFood);
                res.status(201).send(result);
            } catch (error) {
                console.error("Error adding food:", error);
                res.status(500).send({ message: "Failed to add food" });
            }
        });

        app.put('/foods/:id', verifyFirebaseToken, async (req, res) => {
            const id = req.params.id;
            const updatedFood = req.body;
            const decodedEmail = req.decodedUser.email;

            try {
                const query = { _id: new ObjectId(id) };
                const food = await foodsCollection.findOne(query);

                if (!food) {
                    return res.status(404).send({ message: "Food not found" });
                }

                if (food.donator && food.donator.email !== decodedEmail) {
                    return res.status(403).send({ message: 'Forbidden access: Not authorized to update this food' });
                }

                const options = { upsert: true };
                const updateDoc = {
                    $set: {
                        foodName: updatedFood.foodName,
                        foodImage: updatedFood.foodImage,
                        foodQuantity: updatedFood.foodQuantity,
                        pickupLocation: updatedFood.pickupLocation,
                        expireDate: updatedFood.expireDate,
                        additionalNotes: updatedFood.additionalNotes,
                        foodStatus: updatedFood.foodStatus
                    },
                };
                const result = await foodsCollection.updateOne(query, updateDoc, options);
                res.send(result);
            } catch (error) {
                console.error("Error updating food:", error);
                res.status(500).send({ message: "Failed to update food" });
            }
        });

        app.delete('/foods/:id', verifyFirebaseToken, async (req, res) => {
            const id = req.params.id;
            const decodedEmail = req.decodedUser.email;

            try {
                const query = { _id: new ObjectId(id) };
                const food = await foodsCollection.findOne(query);

                if (!food) {
                    return res.status(404).send({ message: "Food not found" });
                }

                if (food.donator && food.donator.email !== decodedEmail) {
                    return res.status(403).send({ message: 'Forbidden access: Not authorized to delete this food' });
                }

                const result = await foodsCollection.deleteOne(query);
                res.send(result);
            } catch (error) {
                console.error("Error deleting food:", error);
                res.status(500).send({ message: "Failed to delete food" });
            }
        });

        app.post('/food-requests', verifyFirebaseToken, async (req, res) => {
            const newRequest = req.body;
            const decodedEmail = req.decodedUser.email;

            if (newRequest.requesterEmail && newRequest.requesterEmail !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden access: Requester email mismatch' });
            }

            try {
                const result = await foodRequestsCollection.insertOne(newRequest);
                if (newRequest.foodId) {
                    await foodsCollection.updateOne(
                        { _id: new ObjectId(newRequest.foodId) },
                        { $set: { foodStatus: 'requested' } }
                    );
                }
                res.status(201).send(result);
            } catch (error) {
                console.error("Error adding food request:", error);
                res.status(500).send({ message: "Failed to add food request" });
            }
        });

        app.get('/food-requests-by-requester', verifyFirebaseToken, async (req, res) => {
            const requestedEmail = req.query.email;
            const decodedEmail = req.decodedUser.email;

            if (requestedEmail !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden access: Email mismatch' });
            }

            try {
                const query = { requesterEmail: requestedEmail };
                const result = await foodRequestsCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching food requests by requester:", error);
                res.status(500).send({ message: "Failed to fetch food requests" });
            }
        });

        app.get('/food-requests-by-donator', verifyFirebaseToken, async (req, res) => {
            const donatorEmail = req.query.email;
            const decodedEmail = req.decodedUser.email;

            if (donatorEmail !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden access: Email mismatch' });
            }

            try {
                const query = { donatorEmail: donatorEmail };
                const result = await foodRequestsCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching food requests by donator:", error);
                res.status(500).send({ message: "Failed to fetch food requests" });
            }
        });

        app.patch('/food-requests/:id/status', verifyFirebaseToken, async (req, res) => {
            const requestId = req.params.id;
            const { newStatus } = req.body;
            const decodedEmail = req.decodedUser.email;

            try {
                const requestQuery = { _id: new ObjectId(requestId) };
                const request = await foodRequestsCollection.findOne(requestQuery);

                if (!request) {
                    return res.status(404).send({ message: "Food request not found" });
                }

                if (request.donatorEmail !== decodedEmail) {
                    return res.status(403).send({ message: 'Forbidden access: Not authorized to update this request status' });
                }

                const updateDoc = {
                    $set: { status: newStatus },
                };

                const result = await foodRequestsCollection.updateOne(requestQuery, updateDoc);

                if (newStatus === 'delivered' && request.foodId) {
                    await foodsCollection.updateOne(
                        { _id: new ObjectId(request.foodId) },
                        { $set: { foodStatus: 'delivered' } }
                    );
                }
                if (newStatus === 'cancelled' && request.foodId) {
                    await foodsCollection.updateOne(
                        { _id: new ObjectId(request.foodId) },
                        { $set: { foodStatus: 'available' } }
                    );
                }

                res.send(result);
            } catch (error) {
                console.error("Error updating food request status:", error);
                res.status(500).send({ message: "Failed to update food request status" });
            }
        });

       
        app.get('/', (req, res) => {
            res.send('Share meal server is running!');
        });

    } finally {
        
    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`Share meal server is running on port ${port}`);
});

module.exports = app;