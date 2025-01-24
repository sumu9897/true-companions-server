const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5500;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "https://true-companions.web.app"],
    credentials: true,
  })
);

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
    const paymentCollection = db.collection("payments");
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
      const search = req.query.search || ""; // Get search term from query
      const query = search
        ? { name: { $regex: search, $options: "i" } } // Case-insensitive regex search
        : {};
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    app.patch(
      "/users/premium/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { role: "premium" } };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

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

    // Request Premium Status
    app.post("/biodatas/premium-request", verifyToken, async (req, res) => {
      const { email } = req.body;

      try {
        // Check if the biodata exists
        const biodata = await biodataCollection.findOne({ email });
        if (!biodata) {
          return res.status(404).send({ message: "Biodata not found" });
        }

        // Prevent duplicate premium requests
        if (biodata.premiumStatus === "approved") {
          return res.status(400).send({ message: "Already a premium member" });
        }

        // Mark request as pending
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
        console.error("Error in premium request:", error);
        res.status(500).send({ error: "Failed to send premium request" });
      }
    });

    // Get All Pending Premium Requests
    app.get(
      "/admin/premium-requests",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const pendingRequests = await biodataCollection
            .find({ premiumStatus: "pending" })
            .toArray();
          res.send(pendingRequests);
        } catch (error) {
          console.error("Error fetching premium requests:", error);
          res.status(500).send({ error: "Failed to fetch premium requests" });
        }
      }
    );

    // Get All Premium Profiles

    app.get("/premium-profiles", async (req, res) => {
      const { order = "asc" } = req.query;
      const sortOrder = order === "desc" ? -1 : 1;

      const premiumProfiles = await biodataCollection
        .find({ premiumStatus: "approved" })
        .sort({ age: sortOrder })
        .toArray();

      res.json(premiumProfiles);
    });

    // Approve Premium Request
    app.patch(
      "/biodatas/premium-approve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;

        try {
          const result = await biodataCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                premiumStatus: "approved",
                isPremium: true,
                premiumApprovedDate: new Date(),
              },
            }
          );

          if (result.modifiedCount === 0) {
            return res
              .status(404)
              .send({ message: "Biodata not found or already approved" });
          }

          res.send({ success: true, message: "Premium request approved" });
        } catch (error) {
          console.error("Error approving premium request:", error);
          res.status(500).send({ error: "Failed to approve premium request" });
        }
      }
    );

    // Reject Premium Request
    app.patch(
      "/biodatas/premium-reject/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;

        try {
          const result = await biodataCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { premiumStatus: "rejected" } } // Mark as rejected
          );

          if (result.modifiedCount === 0) {
            return res
              .status(404)
              .send({ message: "Biodata not found or already rejected" });
          }

          res.send({ success: true, message: "Premium request rejected" });
        } catch (error) {
          console.error("Error rejecting premium request:", error);
          res.status(500).send({ error: "Failed to reject premium request" });
        }
      }
    );

    // Check If User is Premium
    app.get("/biodatas/is-premium/:email", verifyToken, async (req, res) => {
      const { email } = req.params;

      try {
        const biodata = await biodataCollection.findOne({ email });

        if (!biodata) {
          return res.status(404).send({ message: "Biodata not found" });
        }

        const isPremium = biodata.isPremium || false; // Default false
        res.send({ email, isPremium });
      } catch (error) {
        console.error("Error checking premium status:", error);
        res.status(500).send({ error: "Failed to check premium status" });
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

    app.post("/favorites", verifyToken, async (req, res) => {
      const { id } = req.body; // Get biodataId from the request body
      const email = req.decoded.email; // Get user's email from decoded JWT token

      // Validate `id`
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid biodata ID." });
      }

      try {
        // Check if the favorite already exists for the user and biodataId
        const existingFavorite = await favoritesCollection.findOne({
          email,
          id: new ObjectId(id), // Ensure proper ID type
        });
        if (existingFavorite) {
          return res
            .status(400)
            .send({ message: "This biodata is already in your favorites." });
        }

        // Fetch the biodata details from the `biodataCollection`
        const biodata = await biodataCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!biodata) {
          console.error(`Biodata with ID ${id} not found`);
          return res.status(404).send({ message: "Biodata not found." });
        }

        // Create a new favorite entry
        const result = await favoritesCollection.insertOne({
          email,
          id: new ObjectId(id), 
          profileImage: biodata.profileImage,
          name: biodata.name,
          age: biodata.age,
          biodataEmail: biodata.email, 
          occupation: biodata.occupation,
          addedAt: new Date(),
        });

        res.send({
          message: "Biodata added to favorites successfully.",
          result,
        });
      } catch (error) {
        console.error("Error adding to favorites:", error);
        res.status(500).send({
          error: "Failed to add biodata to favorites.",
          details: error.message,
        });
      }
    });

    app.get("/favorites/:id", verifyToken, async (req, res) => {
      const biodataId = req.params.id;
      const userId = req.user.id;

      const favorite = await favoritesCollection.findOne({ biodataId, userId });

      if (favorite) {
        return res.status(200).json({ exists: true });
      }

      return res.status(404).json({ exists: false });
    });

    // app.get("/favorites", verifyToken, async (req, res) => {
    //   const email = req.decoded.email;
      
    //   try {
    //     const favorites = await favoritesCollection
    //       .aggregate([
    //         { $match: { email } },
    //         {
    //           $lookup: {
    //             from: "biodatas",
    //             localField: "biodataId",
    //             foreignField: "_id",
    //             as: "biodataDetails",
    //           },
    //         },
    //         { $unwind: "$biodataDetails" },
    //       ])
    //       .toArray();
    
    //     res.send(favorites);
    //   } catch (error) {
    //     console.error("Error fetching favorites:", error);
    //     res.status(500).send({ error: "Failed to fetch favorites" });
    //   }
    // });



    app.get('/favorites',verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await favoritesCollection.find(query).toArray();
      res.send(result);
    });

    

    app.delete('/favorites/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await favoritesCollection.deleteOne(query);
      res.send(result);
    });
    
    
    

    // Create Payment Intent Route
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      const amount = parseInt(price * 100);
      console.log(amount, "amount");

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/payments", verifyToken, async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      //  carefully delete each item from the cart
      console.log("payment info", payment);

      res.send(paymentResult);
    });

    app.delete("/favorites/:biodataId", verifyToken, async (req, res) => {
      const { biodataId } = req.params;
      const email = req.decoded.email;

      if (!biodataId) {
        return res.status(400).json({ message: "biodataId is required" });
      }

      try {
        const result = await favoritesCollection.deleteOne({
          email,
          biodataId: String(biodataId),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Favorite not found" });
        }

        res.status(200).json({ message: "Favorite deleted successfully" });
      } catch (error) {
        console.error("Error deleting favorite:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get("/admin-stats", async (req, res) => {
      try {
        const biodataCount = await biodataCollection.estimatedDocumentCount();

        // Count male and female biodata
        const maleCount = await biodataCollection.countDocuments({
          biodataType: "Male",
        });
        const femaleCount = await biodataCollection.countDocuments({
          biodataType: "Female",
        });

        // Count premium biodata
        const premiumCount = await biodataCollection.countDocuments({
          premiumStatus: "approved",
        });

        // Calculate total revenue
        // const payments = await paymentCollection.find().toArray();
        // const revenue = payments.reduce((total, payment) => total + payment.amount, 0);

        const result = await paymentCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalRevenue: {
                  $sum: "$amount",
                },
              },
            },
          ])
          .toArray();

        const revenue = result.length > 0 ? result[0].totalRevenue : 0;

        res.send({
          biodataCount,
          maleCount,
          femaleCount,
          premiumCount,
          revenue,
        });
      } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).send({ error: "Internal server error" });
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
