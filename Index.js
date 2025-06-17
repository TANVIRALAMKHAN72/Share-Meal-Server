const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
const { ObjectId } = require("mongodb");


app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@nexus0.ytaptl9.mongodb.net/?retryWrites=true&w=majority&appName=Nexus0`;







const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const verifyFirebaseToken = async (req, res, next) => {
const authHeader = req.headers?.authorization;

if(!authHeader || !authHeader.startsWith('Bearer ')){
  return res.status(401).send({message : 'unauthorization access' })
}
const token = authHeader.split(' ')[1];

try{
  const decoded = await admin.auth().verifyIdToken(token)
  console.log('decoded token', decoded)
  req.decoded = decoded;
  next();
}
catch(error){
    return res.status(401).send({message : 'unauthorization access' })
}

}

async function run() {
  try {
    
    await client.connect();

const foodCollection = client.db("share_meal").collection('foods');
const usersCollection = client.db("share_meal").collection('users');
const foodRequestsCollection = client.db("share_meal").collection('foodRequests');


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


app.post('/food-requests', async (req, res) => {
  const requestData = req.body;
  try {
    
    const result = await foodRequestsCollection.insertOne(requestData);

  
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


app.get('/food-requests', verifyFirebaseToken, async (req, res) => {
  const userEmail = req.query.userEmail;

  if (!userEmail) {
    return res.status(400).send({ error: "User email required" });
  }

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


app.post('/users', async (req, res) => {
    const userProfile = req.body;
    const result = await usersCollection.insertOne(userProfile);
    res.send(result);
})


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Share Meal is testing!')
})

app.listen(port, () => {
  console.log(`Share meal server is running on port ${port}`)
})
// module.exports = app;
