# URL Compare

A powerful web application for comparing URLs between different domains, perfect for website migrations, domain changes, and URL structure validation.

## 🚀 Features

- **Bulk URL Comparison**: Compare hundreds of URLs between old and new domains simultaneously
- **Real-time Progress Tracking**: Monitor comparison progress with live updates
- **Comprehensive Status Reporting**: Track OK, redirected, missing, and error URLs
- **Export Capabilities**: Export results in JSON or CSV formats
- **Background Job Processing**: Handle large URL sets with asynchronous job processing
- **Redirect Chain Analysis**: Follow and analyze complete redirect chains
- **Responsive UI**: Modern, mobile-friendly interface built with React and Tailwind CSS
- **Docker Support**: Easy deployment with Docker and Docker Compose

## 🛠️ Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS 4, Radix UI components
- **Database**: SQLite with Prisma ORM
- **Backend**: Next.js API routes with Node.js
- **Real-time Updates**: Socket.IO for live progress tracking
- **Deployment**: Docker, Docker Compose
- **Development Tools**: ESLint, TypeScript, Nodemon

## 📋 Prerequisites

- Node.js 20+ 
- npm or yarn
- Docker and Docker Compose (for deployment)

## 🏗️ Installation

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd urlcompare
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

### Production Deployment

For production deployment, see the detailed [DEPLOY.md](./DEPLOY.md) guide.

## 🎯 Usage

### Basic URL Comparison

1. **Enter Source URLs**: Paste or type your list of URLs (one per line) from your original domain
2. **Set New Domain**: Enter the target domain you want to compare against
3. **Optional Job Name**: Give your comparison a descriptive name for easy reference
4. **Start Comparison**: Click "Start Comparison" to begin the process

### Example

**Source URLs:**
```
https://oldsite.com/page1
https://oldsite.com/blog/article1
https://oldsite.com/about
```

**New Domain:** `https://newsite.com`

The tool will check:
- `https://newsite.com/page1`
- `https://newsite.com/blog/article1`
- `https://newsite.com/about`

### Understanding Results

- **✅ OK**: URL exists and returns 2xx status code
- **🔄 Redirected**: URL redirects to another location (3xx status)
- **❌ Missing**: URL returns 404 or similar error
- **⚠️ Error**: Network error or timeout occurred

### Exporting Results

- **JSON Export**: Complete data including redirect chains and metadata
- **CSV Export**: Simplified tabular format for spreadsheet analysis

## 📡 API Documentation

### POST `/api/comparison`

Start a new URL comparison job.

**Request Body:**
```json
{
  "sourceUrls": ["https://old.com/page1", "https://old.com/page2"],
  "newDomain": "https://new.com",
  "name": "Migration Check",
  "config": {
    "followRedirects": true,
    "maxConcurrency": 10,
    "retryAttempts": 3,
    "timeoutSeconds": 30
  }
}
```

**Response:**
```json
{
  "jobId": "job_123",
  "status": "pending",
  "totalUrls": 2
}
```

### GET `/api/jobs/[id]`

Get job status and results.

**Response:**
```json
{
  "job": {
    "id": "job_123",
    "status": "completed",
    "totalUrls": 2,
    "completedUrls": 2
  },
  "results": [...],
  "summary": {
    "totalUrls": 2,
    "ok": 1,
    "redirected": 1,
    "missing": 0,
    "error": 0
  }
}
```

### GET `/api/export/[jobId]`

Export job results.

**Query Parameters:**
- `format`: `json` or `csv`

## 🧪 Development

### Available Scripts

- `npm run dev`: Start development server with hot reload
- `npm run build`: Build for production
- `npm run start`: Start production server
- `npm run lint`: Run ESLint
- `npm run db:push`: Push database schema changes
- `npm run db:generate`: Generate Prisma client
- `npm run db:migrate`: Run database migrations
- `npm run db:reset`: Reset database

### Project Structure

```
src/
├── app/
│   ├── api/          # API routes
│   ├── globals.css   # Global styles
│   ├── layout.tsx    # Root layout
│   └── page.tsx      # Home page
├── components/
│   ├── ui/           # Reusable UI components
│   └── NavBar.tsx    # Navigation component
├── hooks/            # Custom React hooks
└── lib/              # Utility functions and database
```

### Database Schema

The application uses SQLite with Prisma ORM. Key models:

- **ComparisonJob**: Stores job metadata and configuration
- **UrlResult**: Individual URL comparison results
- **User**: User management (future feature)

## 🚀 Deployment

### Docker Deployment

1. **Create environment file**
   ```bash
   echo "APP_PORT=3000" > .env
   ```

2. **Build and start**
   ```bash
   docker-compose up -d --build
   ```

3. **Verify deployment**
   ```bash
   curl http://localhost:3000/api/health
   ```

For detailed deployment instructions, see [DEPLOY.md](./DEPLOY.md).

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | 3000 | Port to expose the application |
| `NODE_ENV` | production | Node.js environment |
| `DATABASE_URL` | file:/app/prisma/database.sqlite | Database connection string |

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Run tests and linting**
   ```bash
   npm run lint
   npm run build
   ```
5. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
6. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Code Style

- Use TypeScript for all new code
- Follow the existing ESLint configuration
- Use Prettier for code formatting
- Write meaningful commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [Radix UI](https://radix-ui.com/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Database management with [Prisma](https://prisma.io/)

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](../../issues) page for existing problems
2. Create a new issue with detailed information
3. Include steps to reproduce the problem
4. Provide your environment details (OS, Node.js version, etc.)

---

**Made with ❤️ for better URL management and website migrations**
