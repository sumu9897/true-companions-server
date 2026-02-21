const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const app = express();
const port = process.env.PORT || 5500;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://bandhanbd.web.app",
      process.env.CLIENT_URL,
    ].filter(Boolean),
    credentials: true,
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rmec6.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

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

async function run() {
  try {
    const db = client.db("bondhanbd");

    const userCollection = db.collection("users");
    const biodataCollection = db.collection("biodatas");
    const favoritesCollection = db.collection("favorites");
    const paymentCollection = db.collection("payments");
    const contactRequestCollection = db.collection("contactRequests");
    const successStoryCollection = db.collection("successStories");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query.search || "";
      const query = search ? { name: { $regex: search, $options: "i" } } : {};
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const user = await userCollection.findOne({ email });
      res.send({ admin: user?.role === "admin" });
    });

    app.get("/users/premium/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const user = await userCollection.findOne({ email });
      res.send({ isPremium: user?.role === "premium" || user?.isPremium === true });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await userCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      user.role = user.role || "user";
      user.isPremium = false;
      user.createdAt = new Date();
      const result = await userCollection.insertOne(user);
      res.status(201).send(result);
    });

    app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user ID" });
      }
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });

    app.patch("/users/premium/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user ID" });
      }
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "premium", isPremium: true } }
      );
      res.send(result);
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid user ID" });
      }
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post("/biodatas", verifyToken, async (req, res) => {
      const biodata = req.body;
      const existing = await biodataCollection.findOne({ email: biodata.email });
      if (existing) {
        return res.status(400).send({ message: "Biodata already exists for this user. Use PUT to update." });
      }
      const lastBiodata = await biodataCollection
        .find()
        .sort({ biodataId: -1 })
        .limit(1)
        .toArray();
      const lastId = lastBiodata[0]?.biodataId || 0;
      biodata.biodataId = lastId + 1;
      biodata.isPremium = false;
      biodata.premiumStatus = "none";
      biodata.createdAt = new Date();
      biodata.updatedAt = new Date();
      const result = await biodataCollection.insertOne(biodata);
      res.status(201).send(result);
    });

    app.put("/biodatas/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const update = req.body;
      delete update._id;
      delete update.biodataId;
      delete update.isPremium;
      delete update.premiumStatus;
      update.updatedAt = new Date();
      const result = await biodataCollection.updateOne(
        { email },
        { $set: update },
        { upsert: false }
      );
      res.send(result);
    });

    app.get("/biodatas", async (req, res) => {
      const {
        page, limit,
        ageMin = 18, ageMax = 100,
        biodataType, division, sort,
      } = req.query;

      const query = {
        age: { $gte: parseInt(ageMin), $lte: parseInt(ageMax) },
        ...(biodataType && { biodataType }),
        ...(division && { permanentDivision: division }),
      };

      const sortOption = sort === "desc" ? { age: -1 } : sort === "asc" ? { age: 1 } : {};
      let cursor = biodataCollection.find(query).sort(sortOption);

      if (page && limit) {
        const skip = (parseInt(page) - 1) * parseInt(limit);
        cursor = cursor.skip(skip).limit(parseInt(limit));
      }

      const biodatas = await cursor.toArray();
      const total = await biodataCollection.countDocuments(query);
      res.send({ biodatas, total });
    });

    app.get("/biodatas/premium", async (req, res) => {
      const { order = "asc" } = req.query;
      const sortOrder = order === "desc" ? -1 : 1;
      const premiumProfiles = await biodataCollection
        .find({ premiumStatus: "approved" })
        .sort({ age: sortOrder })
        .limit(6)
        .toArray();
      res.send(premiumProfiles);
    });

    app.get("/biodatas/stats", async (req, res) => {
      const totalBiodata = await biodataCollection.countDocuments();
      const maleBiodata = await biodataCollection.countDocuments({ biodataType: "Male" });
      const femaleBiodata = await biodataCollection.countDocuments({ biodataType: "Female" });
      const premiumBiodata = await biodataCollection.countDocuments({ premiumStatus: "approved" });
      const marriagesCompleted = await successStoryCollection.countDocuments();
      res.send({ totalBiodata, maleBiodata, femaleBiodata, premiumBiodata, marriagesCompleted });
    });

    app.get("/biodatas/mine", verifyToken, async (req, res) => {
      const email = req.decoded.email;
      const biodata = await biodataCollection.findOne({ email });
      if (!biodata) {
        return res.status(404).send({ message: "Biodata not found" });
      }
      res.send(biodata);
    });

    app.get("/biodatas/by-email/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const biodata = await biodataCollection.findOne({ email });
      if (!biodata) return res.status(404).send({ message: "Biodata not found" });
      res.send(biodata);
    });

    app.get("/biodatas/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid biodata ID" });
      }
      try {
        const biodata = await biodataCollection.findOne({ _id: new ObjectId(id) });
        if (!biodata) return res.status(404).send({ message: "Biodata not found" });

        const requesterEmail = req.decoded.email;
        const requesterUser = await userCollection.findOne({ email: requesterEmail });
        const isPremium = requesterUser?.role === "premium" || requesterUser?.isPremium === true;

        const approvedRequest = await contactRequestCollection.findOne({
          requesterEmail,
          biodataId: biodata.biodataId,
          status: "approved",
        });

        if (!isPremium && !approvedRequest) {
          delete biodata.contactEmail;
          delete biodata.mobileNumber;
        }

        res.send(biodata);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch biodata" });
      }
    });

    app.post("/biodatas/premium-request", verifyToken, async (req, res) => {
      const email = req.decoded.email;
      const biodata = await biodataCollection.findOne({ email });
      if (!biodata) return res.status(404).send({ message: "Biodata not found" });
      if (biodata.premiumStatus === "approved") {
        return res.status(400).send({ message: "Already a premium member" });
      }
      if (biodata.premiumStatus === "pending") {
        return res.status(400).send({ message: "Premium request already pending" });
      }
      await biodataCollection.updateOne(
        { email },
        { $set: { premiumStatus: "pending", premiumRequestDate: new Date() } }
      );
      res.send({ success: true, message: "Premium request sent. Awaiting admin approval." });
    });

    app.get("/admin/biodatas", verifyToken, verifyAdmin, async (req, res) => {
      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const biodatas = await biodataCollection
        .find({})
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
      const total = await biodataCollection.countDocuments();
      res.send({ biodatas, total, page: parseInt(page), limit: parseInt(limit) });
    });

    app.get("/admin/premium-requests", verifyToken, verifyAdmin, async (req, res) => {
      const pendingRequests = await biodataCollection
        .find({ premiumStatus: "pending" })
        .toArray();
      res.send(pendingRequests);
    });

    app.patch("/admin/biodatas/:id/approve-premium", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });
      const result = await biodataCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { premiumStatus: "approved", isPremium: true, premiumApprovedDate: new Date() } }
      );
      if (result.modifiedCount === 0) {
        return res.status(404).send({ message: "Biodata not found or already approved" });
      }
      res.send({ success: true, message: "Premium request approved" });
    });

    app.patch("/admin/biodatas/:id/reject-premium", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });
      const result = await biodataCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { premiumStatus: "rejected" } }
      );
      if (result.modifiedCount === 0) {
        return res.status(404).send({ message: "Biodata not found" });
      }
      res.send({ success: true, message: "Premium request rejected" });
    });

    // ════════════════════════════════════════════════════════════════════════
    // FAVOURITES
    // ════════════════════════════════════════════════════════════════════════

    // GET /favourites — get current user's favourites
    app.get("/favourites", verifyToken, async (req, res) => {
      const email = req.decoded.email;
      const result = await favoritesCollection.find({ email }).toArray();
      res.send(result);
    });

    // GET /favourites/check — check if a specific biodata is in user's favourites
    app.get("/favourites/check", verifyToken, async (req, res) => {
      const { biodataMongoId } = req.query;
      const email = req.decoded.email;

      if (!biodataMongoId || !ObjectId.isValid(biodataMongoId)) {
        return res.status(400).send({ message: "Invalid biodata ID" });
      }

      const existing = await favoritesCollection.findOne({
        email,
        biodataMongoId: new ObjectId(biodataMongoId),
      });

      res.send({ isFavourite: !!existing });
    });

    // POST /favourites — add a biodata to favourites
    app.post("/favourites", verifyToken, async (req, res) => {
      const { biodataMongoId } = req.body;
      const email = req.decoded.email;

      if (!ObjectId.isValid(biodataMongoId)) {
        return res.status(400).send({ message: "Invalid biodata ID" });
      }

      const existing = await favoritesCollection.findOne({
        email,
        biodataMongoId: new ObjectId(biodataMongoId),
      });
      if (existing) {
        return res.status(400).send({ message: "Already in your favourites" });
      }

      const biodata = await biodataCollection.findOne({ _id: new ObjectId(biodataMongoId) });
      if (!biodata) return res.status(404).send({ message: "Biodata not found" });

      const result = await favoritesCollection.insertOne({
        email,
        biodataMongoId: new ObjectId(biodataMongoId),
        biodataId: biodata.biodataId,
        name: biodata.name,
        permanentDivision: biodata.permanentDivision,
        occupation: biodata.occupation,
        profileImage: biodata.profileImage,
        addedAt: new Date(),
      });

      res.status(201).send({ message: "Added to favourites", result });
    });

    // DELETE /favourites/:id — remove a favourite by its document _id
    app.delete("/favourites/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const email = req.decoded.email;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });
      const result = await favoritesCollection.deleteOne({
        _id: new ObjectId(id),
        email,
      });
      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Favourite not found" });
      }
      res.send({ message: "Favourite removed successfully" });
    });

    // ════════════════════════════════════════════════════════════════════════
    // PAYMENTS (Stripe)
    // ════════════════════════════════════════════════════════════════════════

    app.post("/payment/create-intent", verifyToken, async (req, res) => {
      const amount = 500;
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      const requesterEmail = req.decoded.email;

      if (payment.email !== requesterEmail) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      payment.createdAt = new Date();
      payment.amount = 5;

      const paymentResult = await paymentCollection.insertOne(payment);
      res.status(201).send(paymentResult);
    });

    app.get("/payments", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await paymentCollection.find({ email }).toArray();
      res.send(result);
    });

    // ════════════════════════════════════════════════════════════════════════
    // CONTACT REQUESTS
    // ════════════════════════════════════════════════════════════════════════

    app.get("/contact-requests/mine", verifyToken, async (req, res) => {
      const requesterEmail = req.decoded.email;
      const result = await contactRequestCollection
        .find({ requesterEmail })
        .toArray();
      res.send(result);
    });

    app.get("/contact-requests", verifyToken, verifyAdmin, async (req, res) => {
      const result = await contactRequestCollection.find().toArray();
      res.send(result);
    });

    app.post("/contact-requests", verifyToken, async (req, res) => {
      const { biodataId, stripePaymentId } = req.body;
      const requesterEmail = req.decoded.email;

      if (!biodataId) {
        return res.status(400).send({ message: "biodataId is required" });
      }

      const existing = await contactRequestCollection.findOne({
        requesterEmail,
        biodataId: parseInt(biodataId),
      });
      if (existing) {
        return res.status(400).send({ message: "Contact request already exists for this biodata" });
      }

      const biodata = await biodataCollection.findOne({ biodataId: parseInt(biodataId) });
      if (!biodata) return res.status(404).send({ message: "Biodata not found" });

      const contactRequest = {
        biodataId: parseInt(biodataId),
        biodataName: biodata.name,
        requesterEmail,
        status: "pending",
        stripePaymentId: stripePaymentId || null,
        amountPaid: 5,
        createdAt: new Date(),
      };

      const result = await contactRequestCollection.insertOne(contactRequest);
      res.status(201).send(result);
    });

    app.patch("/contact-requests/:id/approve", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });
      const result = await contactRequestCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved", approvedAt: new Date() } }
      );
      if (result.modifiedCount === 0) {
        return res.status(404).send({ message: "Request not found or already approved" });
      }
      res.send({ success: true, message: "Contact request approved" });
    });

    app.delete("/contact-requests/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const email = req.decoded.email;
      if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });
      const result = await contactRequestCollection.deleteOne({
        _id: new ObjectId(id),
        requesterEmail: email,
      });
      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Request not found" });
      }
      res.send({ message: "Contact request deleted" });
    });

    // ════════════════════════════════════════════════════════════════════════
    // SUCCESS STORIES
    // ════════════════════════════════════════════════════════════════════════

    app.get("/success-stories", async (req, res) => {
      const stories = await successStoryCollection
        .find({})
        .sort({ marriageDate: -1 })
        .toArray();
      res.send(stories);
    });

    app.get("/success-stories/admin", verifyToken, verifyAdmin, async (req, res) => {
      const stories = await successStoryCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      res.send(stories);
    });

    app.post("/success-stories", verifyToken, async (req, res) => {
      const {
        selfBiodataId, partnerBiodataId, coupleImage,
        successStory, marriageDate, reviewStar,
      } = req.body;

      if (!selfBiodataId || !partnerBiodataId || !successStory || !marriageDate || !reviewStar) {
        return res.status(400).send({ message: "All fields are required" });
      }

      const star = parseInt(reviewStar);
      if (star < 1 || star > 5) {
        return res.status(400).send({ message: "Review star must be between 1 and 5" });
      }

      const newStory = {
        selfBiodataId: parseInt(selfBiodataId),
        partnerBiodataId: parseInt(partnerBiodataId),
        coupleImage: coupleImage || null,
        successStory,
        marriageDate: new Date(marriageDate),
        reviewStar: star,
        submitterEmail: req.decoded.email,
        createdAt: new Date(),
      };

      const result = await successStoryCollection.insertOne(newStory);
      res.status(201).send({ message: "Success story submitted!", storyId: result.insertedId });
    });

    // ════════════════════════════════════════════════════════════════════════
    // ADMIN STATS
    // ════════════════════════════════════════════════════════════════════════

    app.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
      const [
        biodataCount, maleCount, femaleCount, premiumCount, revenueResult,
      ] = await Promise.all([
        biodataCollection.estimatedDocumentCount(),
        biodataCollection.countDocuments({ biodataType: "Male" }),
        biodataCollection.countDocuments({ biodataType: "Female" }),
        biodataCollection.countDocuments({ premiumStatus: "approved" }),
        paymentCollection
          .aggregate([{ $group: { _id: null, totalRevenue: { $sum: "$amount" } } }])
          .toArray(),
      ]);

      const revenue = revenueResult[0]?.totalRevenue || 0;
      res.send({ biodataCount, maleCount, femaleCount, premiumCount, revenue });
    });

  } finally {}
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send({ message: "BandhanBD API is running", status: "ok" });
});

app.listen(port, () => {
  console.log(`BandhanBD Server running on port ${port}`);
});