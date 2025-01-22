const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5500;

// middleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rmec6.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("trueCompanions");
    const userCollection = db.collection("users");
    const biodataCollection = db.collection("biodatas");
    const favoritesCollection = db.collection("favorites");
    const contactRequestCollection = db.collection("contactRequests");
    const successStoryCollection = db.collection("successStories");

    // User related API
    app.post('/users', async (req, res) => {
      console.log('User data received:', req.body);
      const user = req.body;
    
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        console.log('User already exists:', existingUser);
        return res.send({ message: 'User already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      console.log('User inserted:', result);
      res.send(result);
    });
    

    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Search Your Partner')
})

app.listen(port, () => {
  console.log(`True Comapaions Running ${port}`);
})

/**
 * --------------------------------
 *      NAMING CONVENTION
 * --------------------------------
 * app.get('/users')
 * app.get('/users/:id')
 * app.post('/users')
 * app.put('/users/:id')
 * app.patch('/users/:id')
 * app.delete('/users/:id')
 * 
*/