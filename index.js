const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5500;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

// middleware
app.use(cors({ origin: ["http://localhost:5173", "https://true-companions.web.app"], credentials: true }));

app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rmec6.mongodb.net/?retryWrites=true&w=majority`;

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
    // await client.connect();

    const db = client.db("trueCompanions");
    const userCollection = db.collection("users");
    const biodataCollection = db.collection("biodatas");
    const favoritesCollection = db.collection("favorites");
    const contactRequestCollection = db.collection("contactRequests");
    const successStoryCollection = db.collection("successStories");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
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
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // User related API
    // Get All User
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      // console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden accsess" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // Create a user
    app.post("/users", async (req, res) => {
      // console.log('User data received:', req.body);
      const user = req.body;

      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        // console.log('User already exists:', existingUser);
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      // console.log('User inserted:', result);
      res.send(result);
    });

    // Make user Admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
        // console.log("Role Change ", result);
      }
    );

    // Delete Signle user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
      // console.log("Delete user", result)
    });

    // Biodata API

    // Create or Edit Biodata
    // app.post("/biodatas", verifyToken, async (req, res) => {
    //   const { email } = req.decoded;
    //   const biodata = req.body;

    //   // Check if user already has a biodata
    //   const existingBiodata = await biodataCollection.findOne({ email });

    //   if (existingBiodata) {
    //     // Update existing biodata
    //     const filter = { email };
    //     const updatedDoc = {
    //       $set: biodata,
    //     };
    //     const result = await biodataCollection.updateOne(filter, updatedDoc);
    //     res.send({ message: "Biodata updated successfully", result });
    //   } else {
    //     // Create new biodata with auto-incremented ID
    //     const lastBiodata = await biodataCollection
    //       .find()
    //       .sort({ biodataId: -1 })
    //       .limit(1)
    //       .toArray();
    //     const lastId = lastBiodata[0]?.biodataId || 0;
    //     const newId = lastId + 1;

    //     const newBiodata = { ...biodata, email, biodataId: newId };
    //     const result = await biodataCollection.insertOne(newBiodata);
    //     res.send({ message: "Biodata created successfully", result });
    //   }
    // });

    app.post("/biodatas", verifyToken, async (req, res) => {
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

    // Fetch a User's Biodata
    app.get("/biodatas", async (req, res) => {
      const {
        page = null,
        limit = null,
        ageMin = 0,
        ageMax = 100,
        biodataType,
        division,
      } = req.query;

      const query = {
        age: { $gte: parseInt(ageMin), $lte: parseInt(ageMax) },
        ...(biodataType && { biodataType }),
        ...(division && { permanentDivision: division }),
      };

      let options = {};
      if (page && limit) {
        options = {
          skip: (page - 1) * parseInt(limit),
          limit: parseInt(limit),
        };
      }

      const biodatas = await biodataCollection.find(query, options).toArray();
      const total = await biodataCollection.countDocuments(query);
      res.send({ biodatas, total });
    });

    app.get("/biodata/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      try {
        const result = await biodataCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!result) {
          return res.status(404).send({ message: "Biodata not found" });
        }
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch biodata" });
      }
    });
    

    // Fetch User's Biodata by email
    app.get("/biodatas/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const biodata = await biodataCollection.findOne({ email });
        if (!biodata)
          return res.status(404).json({ message: "Biodata not found" });
        res.status(200).json(biodata);
      } catch (error) {
        console.error("Error fetching biodata:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.post("/biodatas/premium-request", verifyToken, async (req, res) => {
      const { email } = req.body;
    
      try {
        const biodata = await biodataCollection.findOne({ email });
        if (!biodata) {
          return res.status(404).send({ message: "Biodata not found" });
        }
    
        if (biodata.premiumStatus === "approved") {
          return res.status(400).send({ message: "Biodata is already premium" });
        }
    
        const result = await biodataCollection.updateOne(
          { email },
          {
            $set: {
              premiumStatus: "pending", 
              premiumRequestDate: new Date(),
            },
          }
        );
    
        res.send({
          success: true,
          message: "Premium request sent. Waiting for admin approval.",
        });
      } catch (error) {
        console.error("Error handling premium request:", error);
        res.status(500).send({ message: "Failed to process premium request" });
      }
    });
    

    // Premium Request API
    // app.post("/biodatas/premium-request", verifyToken, async (req, res) => {
    //   const { email } = req.body;
    //   const biodata = await biodataCollection.findOne({ email });

    //   if (!biodata) {
    //     return res.status(404).send({ message: "Biodata not found" });
    //   }

    //   const updatedBiodata = { ...biodata, isPremium: true };
    //   const result = await biodataCollection.updateOne(
    //     { email },
    //     { $set: updatedBiodata }
    //   );

    //   res.send({ success: true, message: "Biodata marked as premium" });
    // });


    app.get("/admin/premium-requests", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const requests = await biodataCollection.find({ premiumStatus: "pending" }).toArray();
        res.send(requests);
      } catch (error) {
        console.error("Error fetching premium requests:", error);
        res.status(500).send({ message: "Failed to fetch premium requests" });
      }
    });

    app.get("/premium-profiles", async (req, res) => {
      const { order = "asc" } = req.query;
    
      try {
        const sortOrder = order === "desc" ? -1 : 1;
        const premiumProfiles = await biodataCollection
          .find({ isPremium: true }) // Filter for premium members
          .sort({ age: sortOrder }) // Sort by age
          .limit(6) // Limit to 6 profiles
          .toArray();
    
        res.status(200).send(premiumProfiles);
      } catch (error) {
        console.error("Error fetching premium profiles:", error);
        res.status(500).send({ error: "Failed to fetch premium profiles" });
      }
    });
    

    app.patch("/biodatas/premium-approve/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
    
      try {
        const result = await biodataCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { premiumStatus: "approved", isPremium: true } }
        );
    
        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: "Biodata not found or already approved" });
        }
    
        res.send({ success: true, message: "Premium request approved" });
      } catch (error) {
        console.error("Error approving premium request:", error);
        res.status(500).send({ message: "Failed to approve premium request" });
      }
    });

    
    app.patch("/biodatas/premium-reject/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
    
      try {
        const result = await biodataCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { premiumStatus: "rejected" } }
        );
    
        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: "Biodata not found or already rejected" });
        }
    
        res.send({ success: true, message: "Premium request rejected" });
      } catch (error) {
        console.error("Error rejecting premium request:", error);
        res.status(500).send({ message: "Failed to reject premium request" });
      }
    });
    
    
    app.get("/admin/biodatas", verifyToken, verifyAdmin, async (req, res) => {
      const { page = 1, limit = 20 } = req.query;

      const options = {
        skip: (page - 1) * parseInt(limit),
        limit: parseInt(limit),
      };

      const biodatas = await biodataCollection.find({}, options).toArray();
      const total = await biodataCollection.countDocuments();
      res.send({
        biodatas,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
      });
    });


    // app.post('/favorites', verifyToken, async (req, res) => {
    //   const { biodataId } = req.body;
    //   const userId = req.user.id; // Ensure verifyToken middleware sets req.user
    
    //   // Check if the biodata is already in the favorites
    //   const existingFavorite = await favoritesCollection.findOne({ biodataId, userId });
    //   if (existingFavorite) {
    //     return res.status(400).json({ message: "Already in favorites" });
    //   }
    
    //   // Save the favorite
    //   const newFavorite = { biodataId, userId };
    //   const result = await favoritesCollection.insertOne(newFavorite);
    
    //   res.status(200).json({ message: "Biodata added to favorites", result });
    // });

    // app.post('/favorites', async (req,res) => {
    //   const favoriteItem = req.body;
    //   const result = await favoritesCollection.insertOne(favoriteItem)
    //   res.send(result);
    // })

    app.post("/favorites", verifyToken, async (req, res) => {
      const { biodataId } = req.body;
      const email = req.decoded.email;
    
      try {
        // Check if the favorite already exists
        const existingFavorite = await favoritesCollection.findOne({
          email,
          biodataId,
        });
        if (existingFavorite) {
          return res
            .status(400)
            .send({ message: "This biodata is already in your favorites." });
        }
    
        // Fetch the biodata details from the biodatas collection
        const biodata = await biodatasCollection.findOne({ biodataId });
        if (!biodata) {
          console.error(`Biodata with ID ${biodataId} not found`);
          return res.status(404).send({ message: "Biodata not found." });
        }
    
        // Create the favorite entry with additional biodata details
        const result = await favoritesCollection.insertOne({
          email,
          biodataId,
          profileImage: biodata.profileImage,
          name: biodata.name,
          age: biodata.age,
          email: biodata.email,
          occupation: biodata.occupation,
          addedAt: new Date(),
        });
    
        console.log("Favorite added successfully:", result);
        res.send({ message: "Biodata added to favorites.", result });
      } catch (error) {
        console.error("Error adding to favorites:", error);
        res.status(500).send({ error: "Failed to add biodata to favorites", details: error.message });
      }
    });
    
    
    
    

    app.get('/favorites/:id',verifyToken, async (req, res) => {
      const biodataId = req.params.id;
      const userId = req.user.id; // Make sure user is authenticated
    
      const favorite = await favoritesCollection.findOne({ biodataId, userId });
      
      if (favorite) {
        return res.status(200).json({ exists: true });
      }
    
      return res.status(404).json({ exists: false });
    });
    
    
    

    app.get("/favorites", verifyToken, async (req, res) => {
      const email = req.decoded.email;
    
      try {
        const favorites = await favoritesCollection
          .aggregate([
            { $match: { email } },
            {
              $lookup: {
                from: "biodatas",
                localField: "biodataId",
                foreignField: "biodataId",
                as: "biodataDetails",
              },
            },
            { $unwind: "$biodataDetails" },
          ])
          .toArray();
    
        res.send(favorites);
      } catch (error) {
        console.error("Error fetching favorites:", error);
        res.status(500).send({ error: "Failed to fetch favorites" });
      }
    });
    

    app.delete("/favorites/:biodataId", verifyToken, async (req, res) => {
      const { biodataId } = req.params;
      const email = req.decoded.email;
    
      if (!biodataId) {
        return res.status(400).json({ message: "biodataId is required" });
      }
    
      try {
        const result = await favoritesCollection.deleteOne({ email, biodataId: String(biodataId) });
    
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Favorite not found" });
        }
    
        res.status(200).json({ message: "Favorite deleted successfully" });
      } catch (error) {
        console.error("Error deleting favorite:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });
    

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Search Your Partner");
});

app.listen(port, () => {
  console.log(`True Comapaions Running ${port}`);
});
