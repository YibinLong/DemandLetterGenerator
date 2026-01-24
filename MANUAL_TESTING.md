# Manual Testing Guide

Quick guide to manually test the Demand Letter Generator.

---

## Quick Start

### 1. Start the app

```bash
# Install dependencies (first time only)
npm run install:all

# Seed the database with test data
cd backend && npm run db:seed && cd ..

# Start all services
npm run dev
```

### 2. Open the app

Go to: **http://localhost:5173**

### 3. Login

```
Email:    admin@andersonlaw.com
Password: password123
```

---

## Test Checklist

### Authentication

- [ ] Go to http://localhost:5173/login
- [ ] Enter credentials above
- [ ] Click "Login"
- [ ] Verify you land on Dashboard
- [ ] Verify your name shows in the header
- [ ] Click logout, verify you're redirected to login

---

### Dashboard

- [ ] After login, you should see the Dashboard
- [ ] Check that stats/metrics display (documents count, letters count)
- [ ] Check that recent items are listed
- [ ] Click around quick action buttons

---

### Document Upload

- [ ] Click "Documents" in the navigation
- [ ] Find the upload area
- [ ] Drag & drop or click to upload a test file (PDF, DOCX, or TXT)
- [ ] Verify success message appears
- [ ] Verify document shows in the list
- [ ] Click to preview document content
- [ ] Try downloading the document
- [ ] Try deleting a document (confirm dialog should appear)

**Test files you can use:**
- Any PDF you have
- Any Word document (.docx)
- A simple .txt file with some text

---

### Create a Demand Letter

This is the main feature!

- [ ] Click "Demand Letters" → "Create New" (or look for a "+ New" button)
- [ ] **Step 1 - Select Documents:** Check one or more source documents, click Next
- [ ] **Step 2 - Enter Case Info:**
  - Client name: "John Smith"
  - Incident date: Pick any date
  - Damages amount: "$50,000"
  - Description: "Personal injury from car accident"
  - Click Generate/Next
- [ ] **Step 3 - Watch Generation:** See the AI generate the letter (streaming text)
- [ ] Verify the letter is created and shows content
- [ ] Check that it appears in the Demand Letters list

---

### View & Edit a Demand Letter

- [ ] Go to Demand Letters list
- [ ] Click on a letter to open it
- [ ] Verify the editor loads with content
- [ ] Make a small text edit (add a word)
- [ ] Verify it saves (auto-save or save button)
- [ ] Look for version history button/tab
- [ ] Check that versions are listed

---

### AI Refinement

- [ ] Open a demand letter
- [ ] Find "Refine" or "Improve with AI" option
- [ ] Enter instruction: "Make the tone more formal"
- [ ] Click Refine
- [ ] Watch the AI update the content
- [ ] Verify a new version was created

---

### Real-Time Collaboration

Best tested with 2 browser windows:

- [ ] Open a demand letter in Chrome
- [ ] Open the SAME letter in an incognito window (or different browser)
- [ ] Log in as the same or different user in window 2
- [ ] Type something in window 1
- [ ] Verify it appears instantly in window 2
- [ ] Try typing in both windows at once
- [ ] Look for cursor indicators showing where others are editing

---

### Sharing

- [ ] Open a demand letter
- [ ] Click "Share" button
- [ ] Search for a user to share with
- [ ] Add them with view or edit permission
- [ ] Verify they appear in the shared list
- [ ] Try removing access

---

### Export to Word

- [ ] Open a demand letter
- [ ] Click "Export" or "Download"
- [ ] Configure options (font, margins, etc.)
- [ ] Click Export/Download
- [ ] Verify .docx file downloads
- [ ] Open it in Word/Google Docs to verify content looks good

---

### Templates

- [ ] Go to "Templates" in navigation
- [ ] Click "Create Template"
- [ ] Fill in:
  - Name: "Test Template"
  - Content: "Dear {{client_name}}, This is regarding {{case_description}}..."
- [ ] Save it
- [ ] Verify it shows in the list
- [ ] Try editing it
- [ ] Try previewing it
- [ ] Try deleting it

---

### Change Tracking

- [ ] Open a demand letter with content
- [ ] Make edits (add text, delete text)
- [ ] Look for a Change Tracking panel
- [ ] Verify changes are highlighted/tracked
- [ ] Try accepting a change
- [ ] Try rejecting a change

---

## Error Scenarios to Try

- [ ] Try uploading an unsupported file type (like .exe)
- [ ] Try generating without selecting any documents
- [ ] Try accessing a demand letter URL that doesn't exist
- [ ] Disconnect your internet and try actions (should show errors gracefully)

---

## Ports Reference

| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:5173  |
| Backend  | http://localhost:3001  |
| AI       | http://localhost:8000  |

---

## Troubleshooting

**App won't start?**
```bash
# Check if ports are in use
lsof -i :5173
lsof -i :3001
lsof -i :8000
```

**Login doesn't work?**
```bash
# Re-seed the database
cd backend && npm run db:seed
```

**AI generation fails?**
- Check that `OPENAI_API_KEY` is set in `.env`
- Check AI service is running: http://localhost:8000/health

**Need to reset everything?**
```bash
cd backend && npm run db:reset && npm run db:seed
```

---

## Notes

- AI generation costs money (OpenAI API). Use small test documents.
- For collaboration testing, use 2+ browser windows.
- The seeded database has sample data to explore.

Happy testing!
