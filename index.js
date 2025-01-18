const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rmec6.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    // Define collections
    const db = client.db("trueCompanions");
    const userCollection = db.collection("users");
    const biodataCollection = db.collection("biodatas");
    const contactRequestCollection = db.collection("contactRequests");
    const successStoryCollection = db.collection("successStories");

    // JWT Token Generation API
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Middleware for token verification
    const verifyToken = (req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      const token = authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // Users API
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const user = await userCollection.findOne({ email });
      const isAdmin = user?.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await userCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Biodata API
    app.post("/biodata", verifyToken, async (req, res) => {
      const biodata = req.body;
      const lastBiodata = await biodataCollection
        .find()
        .sort({ biodataId: -1 })
        .limit(1)
        .toArray();
      const lastId = lastBiodata[0]?.biodataId || 0;
      biodata.biodataId = lastId + 1;
      biodata.createdAt = new Date();
      const result = await biodataCollection.insertOne(biodata);
      res.send(result);
    });

    app.put("/biodata/:id", verifyToken, async (req, res) => {
      const id = parseInt(req.params.id);
      const updatedData = req.body;
      const result = await biodataCollection.updateOne(
        { biodataId: id },
        { $set: updatedData }
      );
      res.send(result);
    });

    // app.get("/biodata", verifyToken, async (req, res) => {
    //   const email = req.decoded.email;
    //   const biodataList = await biodataCollection
    //     .find({ contactEmail: email })
    //     .toArray();
    //   res.send(biodataList);
    // });

    // app.get("/biodatas",async(req, res) => {
    //   const result = await biodataCollection.find().toArray();
    //   res.send(result);
    // })

    app.get("/biodatas", async (req, res) => {
      const { ageMin, ageMax, biodataType, division } = req.query;
    
      // Construct the query object
      const query = {};
      if (ageMin && ageMax) {
        query.age = { $gte: parseInt(ageMin), $lte: parseInt(ageMax) };
      }
      if (biodataType) {
        query.biodataType = biodataType;
      }
      if (division) {
        query.permanentDivision = division;
      }
      // console.log("Query Object:", query);
    
      try {
        const result = await biodataCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch biodatas" });
      }
    });
    

    
    

    app.get("/biodata/:id", async (req, res) => {
      const id = req.params.id;
      const result = await biodataCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.delete("/biodata/:id", verifyToken, async (req, res) => {
      const id = parseInt(req.params.id);
      const result = await biodataCollection.deleteOne({ biodataId: id });
      res.send(result);
    });

    // Contact Requests API
    app.post("/contactRequest", verifyToken, async (req, res) => {
      const request = req.body;
      const result = await contactRequestCollection.insertOne(request);
      res.send(result);
    });

    // Success Stories API
    app.post("/successStory", verifyToken, async (req, res) => {
      const story = req.body;
      const result = await successStoryCollection.insertOne(story);
      res.send(result);
    });

    // Start server
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);
