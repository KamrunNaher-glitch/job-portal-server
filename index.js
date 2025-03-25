const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());




const verifyToken = (req, res, next) => {
  // console.log('inside verify token middleware', req.cookies)
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({message : 'Unauthorized access'})
  }

  jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded) =>{
    if (err) {
      return res.status(401).send({message : 'Unauthorized access'})
    }
    req.user = decoded;
  })
    next();
  
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sou5t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db; // Store the database connection

// Function to connect to MongoDB (Singleton Approach)
async function connectDB() {
  if (!db) {
    try {
      await client.connect();
      db = client.db("jobPortal");
      console.log("Connected to MongoDB!");
    } catch (error) {
      console.error("MongoDB connection error:", error);
    }
  }
  return db;
}
// Auth Related API 

app.post('/jwt', async (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });
  res
    .cookie('token', token, {
    httpOnly: true,
    secure: false,
  })
    .send({ success: true })
});

  app.post('/logout',(req,res) =>{
    res
    .clearCookie('token',{
      httpOnly:true,
      secure: false,
    })
    .send({success:true})
  })


// Jobs API Route
app.get('/jobs',   async (req, res) => {
    console.log('now inside the API callback')
  const email = req.query.email;
  let query = {};
  if (email) {
    query = { hr_email: email }
  }
  try {
    const db = await connectDB();
    if (!db) {
      return res.status(500).send("Database connection failed");
    }
    const jobsCollection = db.collection('jobs');
    const jobs = await jobsCollection.find(query).toArray();
    res.send(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get('/jobs/:id', async (req, res) => {


  try {
    const db = await connectDB(); // Ensure database connection
    if (!db) {
      return res.status(500).send("Database connection failed");
    }

    const jobsCollection = db.collection('jobs'); // Get the collection
    const id = req.params.id;

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid job ID format");
    }

    const query = { _id: new ObjectId(id) };
    const result = await jobsCollection.findOne(query);

    if (!result) {
      return res.status(404).send("Job not found");
    }

    res.send(result);
  } catch (error) {
    console.error("Error fetching job by ID:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post('/jobs', async (req, res) => {
  const newJob = req.body;
  const result = await jobsCollection.insertOne(newJob);
  res.send(result);
})

// Job Application Api 
const jobApplicationCollection = client.db('jobPortal').collection('job_applications');
const jobsCollection = client.db('jobPortal').collection('jobs'); // Ensure jobsCollection is defined

app.get('/job-application', verifyToken, async (req, res) => {
  try {
    const email = req.query.email;
    const query = { applicant_email: email };
    // console.log(req.cookies)
   if(req.user.email !== req.query.email){
    return res.status(403).send({message : 'forbidden access'})
   }

    const applications = await jobApplicationCollection.find(query).toArray();

    for (const application of applications) {
      if (application.job_id) {
        const job = await jobsCollection.findOne({ _id: new ObjectId(application.job_id) });
        if (job) {
          application.title = job.title;
          application.location = job.location;
          application.company = job.company;
          application.company_logo = job.company_logo;
        }
      }
    }

    res.send(applications);
  } catch (error) {
    console.error("Error fetching job applications:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get('/job-applications/jobs/:job_id', async (req, res) => {
  const jobId = req.params.job_id;
  const query = { job_id: jobId }
  const result = await jobApplicationCollection.find(query).toArray();
  res.send(result);
})



app.post('/job-applications', async (req, res) => {
  const application = req.body;
  const result = await jobApplicationCollection.insertOne(application);

  const id = application.job_id;
  const query = { _id: new ObjectId(id) }
  const job = await jobsCollection.findOne(query);
  let newCount = 0;
  if (job.applicationCount) {
    newCount = job.applicationCount + 1;
  }
  else {
    newCount = 1;
  }

  const filter = { _id: new ObjectId(id) };
  const updatedDoc = {
    $set: {
      applicationCount: newCount
    }
  }
  const updateResult = await jobsCollection.updateOne(filter, updatedDoc);
  res.send(result);
});

app.patch('/job-applications/:id', async (req, res) => {
  const id = req.params.id;
  const data = req.body;
  const filter = { _id: new ObjectId(id) };
  const updatedDoc = {
    $set: {
      status: data.status
    }
  }
  const result = await jobApplicationCollection.updateOne(filter, updatedDoc);
  res.send(result)
})


// Home Route
app.get('/', (req, res) => {
  res.send('Job is falling from the sky');
});

// Start the Server
app.listen(port, () => {
  console.log(`Job is waiting at: ${port}`);
});


