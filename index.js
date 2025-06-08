require('dotenv').config()
const express = require('express')
const app = express()
const cors = require("cors")
const jwt = require("jsonwebtoken")
const stripe = require("stripe")(process.env.PAYMENT_SECRETE_KEY);

const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId} = require('mongodb');

// middleware---------
app.use(cors())
app.use(express.static("public"))
app.use(express.json())







const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hhpkb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

        const db = client.db("resturantDB")
        const menuCollection = db.collection("menu")
        const reviewCollection = db.collection("reviews")
        const cartCollection = db.collection("carts")
        const userCollection = db.collection("users")
        const paymentCollection = db.collection("payment")
        // ---------------------
        // verify token---------
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "unnAuthorize access" })
            }
            const token = req.headers.authorization.split(" ")[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: "unAuthorize access" })
                }
                req.decoded = decoded
                next()
            })

        }
        //  verifyAdmin---------
        const verifyAdmin = async (req, res, next) => {
            try {
                const email = req.decoded.email;
                const query = { email: email };
                const user = await userCollection.findOne(query);

                if (!user || user.role !== "admin") {
                    return res.status(403).send({ message: "unauthorized access" });
                }

                next();
            } catch (error) {
                console.error("verifyAdmin error:", error);
                res.status(500).send({ message: "Server error during admin check" });
            }
        };

        // payment calculate----------
        //    const calculateOrderAmount=(item)=>{
        //       let total= 0;
        //       item.forEach(item => {
        //          total += item.amount
        //       }); 
        //       return total
        //    }

        // ------------------------

        //   Payment related api-----------

        app.post("/create-payment-intent", async (req, res) => {
            // const {item}=req.body
            const { price } = req.body

            const paymentIntent = await stripe.paymentIntents.create({
                // amount:calculateOrderAmount(item),
                // currency:"usd",
                // automatic_payment_methods:{
                //     enabled:true,
                // },
                amount: parseInt(price * 100),
                currency: "usd",
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.get("/payment/:email", verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" })
            }
            const result = await paymentCollection.find(query).toArray()
            res.send(result)
        })

        app.post("/payment", async (req, res) => {
            const payment = req.body
            const paymentResult = await paymentCollection.insertOne(payment)
            console.log(payment)
            //  delete paid items from cart-----------
            const deleteResult = await cartCollection.deleteMany({
                _id: { $in: payment.cartIds.map(cartId => new ObjectId(cartId)) }
            })
            res.send({ deleteResult, paymentResult })
        })

        // menu related api--------------
        app.get("/menus", async (req, res) => {

            const result = await menuCollection.find({}).toArray()
            res.send(result)
        })
        app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body
            const result = await menuCollection.insertOne(item)
            res.send(result)
        })

        app.delete("/menus/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            console.log("itemId=>", id)
            const query = { _id: id }
            const result = await menuCollection.deleteOne(query)
            console.log("Delete result=>", result)
            res.send(result)
        })

        app.get("/menu/:id", async (req, res) => {
            const id = req.params.id
            const query = { _id: id }
            const result = await menuCollection.find(query).toArray()
            res.send(result)
        })

        app.patch("/menu/:id", async (req, res) => {
            const item = req.body
            const id = req.params.id
            const filter = { _id: id }
            const updatedDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.recipe,
                    image: item.image
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        app.get("/reviews", async (req, res) => {
            const result = await reviewCollection.find({}).toArray()
            res.send(result)
        })

        // cart related api-------------------
        app.get('/carts', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await cartCollection.find(query).toArray()
            res.send(result)
        })
        app.post("/carts", async (req, res) => {
            const cartItem = req.body
            const result = await cartCollection.insertOne(cartItem)
            res.send(result)
        })
        app.delete("/carts/:id", async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query)
            res.send(result)
        })

        //    user related api---------
        app.post("/jwt", async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" })
            console.log(token)
            res.send({ token })
        })



        app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query)
            res.send(result)
        })



        //  query for admin--------
        app.get("/order-state", async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: "$itemIds"
                },
                {
                    $lookup: {
                        from: "menu",
                        localField: "itemIds",
                        foreignField: "_id",
                        as: "menuItem"
                    }
                },
                {
                    $unwind: "$menuItem"

                },
                {
                    $group: {
                        _id: "$menuItem.category",
                        quantity: { $sum: 1 },
                        revenue: { $sum: "$menuItem.price" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: "$_id",
                        quantity: "$quantity",
                        revenue: "$revenue"
                    }
                }


            ]).toArray()
            res.send(result)
        })

        app.get("/admin-state",  verifyToken, verifyAdmin,async (req, res) => {
            const menuItem = await menuCollection.estimatedDocumentCount()
            const users = await userCollection.estimatedDocumentCount()
            const orders = await paymentCollection.estimatedDocumentCount()

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray()
            const resultOfRevenue = result.length > 0 ? result[0].totalRevenue : 0
            res.send({
                menuItem,
                users,
                orders,
                resultOfRevenue
            })
        })
        app.get("/users/admin/:email", verifyToken, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" })
            }
            const query = { email: email }
            const result = await userCollection.findOne(query)
            let admin = false;
            if (result?.role === "admin") {
                admin = true
            }
            res.send({ admin })
        })

        app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: "admin"
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find({}).toArray()
            res.send(result)
        })
        app.post("/users", async (req, res) => {
            const user = req.body;
            // query for google login--------
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: "user already existing", insertedId: null })
            }
            const result = await userCollection.insertOne(user)
            res.send(result)
        })



        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");



    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }


}
run().catch(console.dir);


app.get("/", (req, res) => {
    res.send("bistro boss is waiting")
})

app.listen(port, () => {
    console.log(`boss is running:${port}`)
})