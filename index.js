const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require('jsonwebtoken')
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rmec6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Define collections
    const userCollection = client.db("trueCompanions").collection("users");
    const biodataCollection = client.db("trueCompanions").collection("biodatas");
    const contactRequestCollection = client.db("trueCompanions").collection("contactRequests");
    const successStoryCollection = client.db("trueCompanions").collection("successStories");

    // JWT related API
    app.post('/jwt', async(req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      })
      res.send({token});
    })

    // middlewares
    // Verify Token
    const verifyToken = (req, res, next) => {
      console.log('inside verify token',req.headers.authorization);
      if(!req.headers.authorization){
        return res.status(401).send({message: 'unatorized access'});
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>{
        if(err){
          return res.status(401).send({message: 'unatorized access'})
        }
        req.decoded= decoded;
        next();
      })
      // next()
    }

    // use verify admin after verifyToken
    const verifyAdmin = async(req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({message: 'forbidden access'})
      }
      next();

    }

    //Users Related API 
    app.get('/users',verifyToken, verifyAdmin, async (req,res) => {
      const result = await userCollection.find().toArray();
      res.send(result)
    })
    app.get('/users/admin/:email',verifyToken, async(req, res) =>{
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'})
      }

      const query = {email: email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    } )


    app.post('/users', async (req, res) =>{
      const user = req.body;

      const query = {email: user.email}
      const existingUser = await userCollection.findOne(query);
      if(existingUser){
        return res.send({message: 'User already exists', insertedId: null})
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })
    //make admin api
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      } 
      const result = await userCollection.updateOne(filter, updatedDoc)
      res.send(result);
    } )
    //user deleted api
    app.delete('/users/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query ={ _id: new ObjectId(id)}
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

        // Biodata Related API
        app.post('/biodata', verifyToken, async (req, res) => {
          const biodata = req.body;
    
          // Get the last created biodata ID
          const lastBiodata = await biodataCollection.find().sort({ biodataId: -1 }).limit(1).toArray();
          const lastId = lastBiodata.length > 0 ? lastBiodata[0].biodataId : 0;
          const newBiodataId = lastId + 1;
    
          // Add the new biodataId to the biodata object
          biodata.biodataId = newBiodataId;
          biodata.createdAt = new Date();
    
          const result = await biodataCollection.insertOne(biodata);
          res.send(result);
        });
    
        // Update an existing biodata
        app.put('/biodata/:id', verifyToken, async (req, res) => {
          const id = req.params.id;
          const updatedData = req.body;
    
          const filter = { _id: new ObjectId(id) };
          const updateDoc = {
            $set: updatedData,
          };
    
          const result = await biodataCollection.updateOne(filter, updateDoc);
          res.send(result);
        });
    
        // Get all biodatas (for admin or authorized purposes)
        app.get('/biodata', verifyToken, verifyAdmin, async (req, res) => {
          const result = await biodataCollection.find().toArray();
          res.send(result);
        });
    
        // Get biodata by ID
        app.get('/biodata/:id', verifyToken, async (req, res) => {
          const id = req.params.id;
    
          const query = { _id: new ObjectId(id) };
          const biodata = await biodataCollection.findOne(query);
          res.send(biodata);
        });
    
        // Delete a biodata
        app.delete('/biodata/:id', verifyToken, verifyAdmin, async (req, res) => {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const result = await biodataCollection.deleteOne(query);
          res.send(result);
        });
    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Search You Partner");
});

app.listen(port, () => {
  console.log(`True Companions Server is Running ${port}`);
});
