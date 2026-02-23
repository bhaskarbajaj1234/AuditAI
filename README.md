# AI Code Reviewer

A full-stack application that leverages AI to provide intelligent code reviews, analysis, and suggestions for improving code quality.

## Features

- **AI-Powered Code Analysis**: Automated code review using AI to identify issues, bugs, and improvement opportunities
- **Real-time Feedback**: Get instant suggestions and recommendations for your code
- **User-Friendly Interface**: Modern, responsive web interface for seamless code review experience
- **RESTful API**: Robust backend API for code analysis operations

## Technology Stack

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **AI Integration** - Integration with AI services for code analysis

### Frontend
- **Vite** - Next generation frontend build tool
- **JavaScript** - Modern web development
- **ESLint** - Code quality and linting

## Project Structure

```
ai-code-reviewer/
├── BackEnd/                    # Node.js backend server
│   ├── src/
│   │   ├── app.js             # Express application setup
│   │   ├── controllers/        # Route controllers
│   │   │   └── ai.controller.js
│   │   ├── routes/             # API routes
│   │   │   └── ai.routes.js
│   │   └── services/           # Business logic services
│   │       └── ai.service.js
│   ├── server.js               # Server entry point
│   └── package.json
└── Frontend/                   # Vite-based frontend application
    ├── src/                    # Frontend source code
    ├── package.json
    ├── vite.config.js          # Vite configuration
    ├── eslint.config.js        # ESLint configuration
    └── README.md               # Frontend documentation
```

## Prerequisites

- **Node.js** (v14 or higher)
- **npm** or **yarn** package manager
- Git (for version control)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ai-code-reviewer
```

### 2. Backend Setup

```bash
cd BackEnd
npm install
```

### 3. Frontend Setup

```bash
cd ../Frontend
npm install
```

## Running the Application

### Start the Backend Server

From the `BackEnd` directory:

```bash
npm start
```

The backend server will run on `http://localhost:3000` (or your configured port).

### Start the Frontend Development Server

From the `Frontend` directory:

```bash
npm run dev
```

The frontend will be accessible at `http://localhost:5173` (default Vite port).

## API Endpoints

### AI Code Review
- **POST** `/api/ai/review` - Submit code for AI analysis and get review suggestions

## Environment Configuration

Before running the application, ensure you have the necessary environment variables configured:

### Backend

Create a `.env` file in the `BackEnd` directory with:

```env
PORT=3000
NODE_ENV=development
AI_API_KEY=<your-ai-service-api-key>
```

### Frontend

Update any API endpoints in your frontend configuration to match your backend server URL.

## Development

### Code Quality

The frontend uses ESLint for code quality checks. Run linting:

```bash
cd Frontend
npm run lint
```

### Building for Production

**Backend**: 
```bash
cd BackEnd
npm run build
```

**Frontend**:
```bash
cd Frontend
npm run build
```

## Contributing

1. Create a feature branch (`git checkout -b feature/AmazingFeature`)
2. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
3. Push to the branch (`git push origin feature/AmazingFeature`)
4. Open a Pull Request


## Support
For issues, feature requests, or questions, please open an issue on the repository.

**Note**: Make sure both the backend and frontend servers are running for the application to work properly.
