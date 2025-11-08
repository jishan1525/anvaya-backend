const { intializeDatabase } = require("./db/db.connect");
const Lead = require("./models/lead.models");
const cors = require("cors");
const express = require("express");
const SalesAgent = require("./models/salesAgent.models");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());
const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));

intializeDatabase();

//leads API
const VALID_STATUSES = [
  "New",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Closed",
];
const VALID_SOURCES = [
  "Website",
  "Referral",
  "Cold Call",
  "Advertisement",
  "Email",
  "Other",
];

app.get("/", (req, res) => {
  res.send("Backend for Anvaya is running!");
});

// 1. Create a New Lead

app.post("/leads", async (req, res) => {
  try {
    const { name, source, salesAgent, status, tags, timeToClose, priority } =
      req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res
        .status(400)
        .json({ error: "Invalid input: 'name' must be a string." });
    }

    // Validate sales agent ID existence
    if (salesAgent) {
      const agent = await SalesAgent.findById(salesAgent);
      if (!agent) {
        return res
          .status(404)
          .json({ error: `Sales agent with ID '${salesAgent}' not found.` });
      }
    }

    const lead = new Lead({
      name,
      source,
      salesAgent,
      status,
      tags,
      timeToClose,
      priority,
    });

    const savedLead = await lead.save();

    // Populate the sales agent info for response
    const populatedLead = await savedLead.populate("salesAgent", "id name");

    res.status(201).json({
      id: populatedLead._id,
      name: populatedLead.name,
      source: populatedLead.source,
      salesAgent: populatedLead.salesAgent
        ? {
            id: populatedLead.salesAgent._id,
            name: populatedLead.salesAgent.name,
          }
        : null,
      status: populatedLead.status,
      tags: populatedLead.tags,
      timeToClose: populatedLead.timeToClose,
      priority: populatedLead.priority,
      createdAt: populatedLead.createdAt,
      updatedAt: populatedLead.updatedAt,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: `Invalid input: ${error.message}` });
    }
    res.status(500).json({ error: "Server error" });
  }
});

//2. Get All Leads

app.get("/leads", async (req, res) => {
  try {
    // Extracting the query parameters from the request URL
    const { salesAgent, status, tags, source } = req.query;

    // Validating salesAgent if it exists
    if (salesAgent && !mongoose.Types.ObjectId.isValid(salesAgent)) {
      return res.status(400).json({
        error: "Invalid input: 'salesAgent' must be a valid ObjectId.",
      });
    }

    // Validating status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid input: 'status' must be one of ${JSON.stringify(
          VALID_STATUSES
        )}.`,
      });
    }

    // Validating source if provided
    if (source && !VALID_SOURCES.includes(source)) {
      return res.status(400).json({
        error: `Invalid input: 'source' must be one of ${JSON.stringify(
          VALID_SOURCES
        )}.`,
      });
    }

    // filter object dynamically is created based on the choice
    // Only include filters that are actually provided
    const filter = {};
    if (salesAgent) filter.salesAgent = salesAgent;
    if (status) filter.status = status;
    if (source) filter.source = source;
    ///user call -> leads?status=New&source=Referral then the { status: "New", source: "Referral" }
    // If multiple tags are sent as comma-separated values spliting them into an array
    if (tags) {
      const tagList = Array.isArray(tags) ? tags : tags.split(",");
      filter.tags = { $in: tagList };
    }

    // Fetching leads from MongoDB using the filters
    // .populate() replaces salesAgent ID with agent name
    // .select() removes unnecessary fields from the result
    const leads = await Lead.find(filter)
      .populate("salesAgent", "name")
      .select("-__v -updatedAt");

    //Format each lead for a clean API response
    const formattedLeads = leads.map((lead) => ({
      id: lead._id,
      name: lead.name,
      source: lead.source,
      salesAgent: lead.salesAgent
        ? { id: lead.salesAgent._id, name: lead.salesAgent.name }
        : null,
      status: lead.status,
      tags: lead.tags,
      timeToClose: lead.timeToClose,
      priority: lead.priority,
      createdAt: lead.createdAt,
    }));

    //Send success response
    res.status(200).json(formattedLeads);
  } catch (error) {
    console.error("Error fetching leads:", error.message);
    res.status(500).json({ error: error.message });
  }
});

//3. Update Lead
app.put("/leads/:id", async (req, res) => {
  try {
    // Extracting ID and body
    const { id } = req.params;
    const { name, source, salesAgent, status, tags, timeToClose, priority } =
      req.body;

    // Basic validation for name
    if (typeof name !== "string" || !name.trim()) {
      return res
        .status(400)
        .json({ error: "Invalid input: 'name' must be a string." });
    }

    // Validate salesAgent existence (if provided)
    if (salesAgent) {
      const agent = await SalesAgent.findById(salesAgent);
      if (!agent) {
        return res
          .status(404)
          .json({ error: `Sales agent with ID '${salesAgent}' not found.` });
      }
    }

    // Update the lead (with validation)
    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      { name, source, salesAgent, status, tags, timeToClose, priority },
      { new: true, runValidators: true } // ensures  validation runs while new:true returns the updated value
    );

    // Handle not found case
    if (!updatedLead) {
      return res.status(404).json({ error: `Lead with ID '${id}' not found.` });
    }

    // populate salesAgent info for the response
    await updatedLead.populate("salesAgent", "name");

    // sending the formatted response
    res.status(200).json({
      id: updatedLead._id,
      name: updatedLead.name,
      source: updatedLead.source,
      salesAgent: updatedLead.salesAgent
        ? { id: updatedLead.salesAgent._id, name: updatedLead.salesAgent.name }
        : null,
      status: updatedLead.status,
      tags: updatedLead.tags,
      timeToClose: updatedLead.timeToClose,
      priority: updatedLead.priority,
      updatedAt: updatedLead.updatedAt,
    });
  } catch (error) {
    console.error("Error updating lead:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//4. Delete lead

app.delete("/leads/:id", async (req, res) => {
  //extract the params
  const { id } = req.params;
  try {
    const leadData = await Lead.findById(id);
    if (!leadData) {
      return res
        .status(404)
        .json({ error: `Lead with ID '${id}' not found.` });
    }

    //  Delete the lead
    await Lead.findByIdAndDelete(id);

    // Responding with success message
    res.status(200).json({ message: "Lead deleted successfully." });
  } catch (error) {
    console.error("Error deleting lead:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//Agents API

// 1. Adding agent after validating the details
app.post("/agents", async (req, res) => {
  try {
    //getting the name and email
    const { name, email } = req.body;

    //basic validation for name to be a string
    if (!name || typeof name !== "string") {
      return res.status(400).json({
        error: "Invalid input: 'name' is required and must be a string.",
      });
    }
    //validation for email
    const indexOfAt = email.indexOf("@");
    const indexOfDot = email.lastIndexOf("."); // use last dot

    if (
      !email ||
      indexOfAt === -1 || // @ not found
      indexOfDot === -1 || // . not found
      indexOfAt > indexOfDot || // dot appears before '@'
      indexOfAt === 0 || // '@' cannot be first character
      indexOfDot === email.length - 1 // . cannot be last character
    ) {
      return res.status(400).json({
        error: "Invalid input: 'email' must be a valid email address.",
      });
    }
    //checking if email is already there
    const existingAgent = await SalesAgent.findOne({ email });
    if (existingAgent) {
      return res
        .status(409)
        .json({ error: `Sales agent with email '${email}' already exists.` });
    }
    //adding new agent
    const newAgent = await SalesAgent.create({ name, email });

    res.status(201).json({
      id: newAgent._id,
      name: newAgent.name,
      email: newAgent.email,
      createdAt: newAgent.createdAt,
    });
  } catch (error) {
    console.error("Error creating agent:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//2. get all the agents

app.get("/agents", async (req, res) => {
  try {
    const agentList = await SalesAgent.find();
    if (agentList) {
      return res.status(200).json(agentList);
    } else {
      return res.status(200).json({ message: "No agents found" });
    }
  } catch (error) {
    console.error("Error getting the agent:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});

