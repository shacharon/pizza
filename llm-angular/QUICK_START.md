# 🚀 Quick Start - Run Both Frontends

## Run Both Local + AWS Simultaneously

### Terminal 1 - Local Backend (Port 4200)
```bash
cd C:\dev\piza\angular-piza\llm-angular
npm start
```
✅ Opens: **http://localhost:4200**  
✅ Connects to: **http://localhost:3000/api/v1**

---

### Terminal 2 - AWS Backend (Port 4201)
```bash
cd C:\dev\piza\angular-piza\llm-angular
npm run aws
```
✅ Opens: **http://localhost:4201**  
✅ Connects to: **http://food-alb-1712335919.eu-north-1.elb.amazonaws.com/api/v1**

---

## Quick Reference

| Command | Port | Backend |
|---------|------|---------|
| `npm start` | 4200 | Local (`localhost:3000`) |
| `npm run local` | 4200 | Local (`localhost:3000`) |
| `npm run aws` | 4201 | AWS (ALB URL) |
| `npm run dev` | 4201 | AWS (ALB URL) |

---

## Environment Indicator

Check the browser console to see which backend you're using:

**Local:**
```
🌍 API Environment: LOCAL
apiUrl: 'http://localhost:3000'
```

**AWS:**
```
🌍 API Environment: DEV
apiUrl: 'http://food-alb-1712335919.eu-north-1.elb.amazonaws.com'
```

---

## Don't Forget!

**If testing local backend, make sure it's running:**
```bash
# Terminal 3 - Backend Server
cd C:\dev\piza\angular-piza\server
npm start
```

**Backend should log:**
```
Server listening on http://localhost:3000
```

---

**Ready to go! 🎊**
