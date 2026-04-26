**Catalyst Recruiter**

**Overview**
Catalyst Recruiter is an autonomous talent scouting and engagement platform. It leverages AI to parse job descriptions, identify matching candidates from a curated database, and conduct automated conversational outreach to evaluate candidate interest and fit. The system provides a ranked shortlist based on match score and simulated engagement metrics.

**Key Features**
- Autonomous Candidate Discovery: Instant matching against job descriptions using advanced language models.
- Conversational Auto-Pilot: Automated engagement with candidates to assess genuine interest levels.
- Explainable AI Ranking: Detailed insights into why each candidate was shortlisted, including pros and cons.
- Dynamic Status Management: Track candidates through the recruitment lifecycle from lead to hired.
- Natural Interface: A specialized serif-based UI designed for professional clarity and focus.

**Prerequisites**
- Node.js (Latest LTS recommended)
- Google Gemini API Key

**Installation**
Install the necessary dependencies using npm:

```bash
npm install
```

**Configuration**
Create a .env file in the root directory and add your Google Gemini API key:

```env
GEMINI_API_KEY=your_api_key_here
```

**Development**
To start the application in development mode:

```bash
npm run dev
```

**Production Build**
To compile the application for production:

```bash
npm run build
```

**Starting the Server**
To run the production server:

```bash
npm start
```
