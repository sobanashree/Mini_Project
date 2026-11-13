// ================= AUTO-DETECT DATA IN LOCAL STORAGE =================
function shapeOf(item) {
    if (!item || typeof item !== "object" || "password" in item) return null;
    const has = (...f) => f.some(x => x in item);

    if (has("issueDate", "issuedDate", "dueDate", "issueId")) return "issues";
    if (has("email", "mobile", "phone", "department", "dept", "memberId")) return "members";
    if (has("author", "category", "quantity", "qty", "isbn", "bookName", "title")) return "books";
    return null;
}

function parseArray(key) {
    try {
        const data = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(data)) return data;
        if (data && typeof data === "object") return Object.values(data);
    } catch (e) { }
    return null;
}

function detectKeys() {
    const found = { books: null, members: null, issues: null };
    const byShape = {};

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const lk = key.toLowerCase();

        if (/user|login|session|current|token/.test(lk)) continue;

        const arr = parseArray(key);
        if (!arr) continue;

        let type = null;
        if (lk.includes("issue")) type = "issues";
        else if (lk.includes("member")) type = "members";
        else if (lk.includes("book") && !lk.includes("return")) type = "books";

        if (type) {
            if (!found[type]) found[type] = key;
        } else if (arr.length > 0) {
            const shape = shapeOf(arr[0]);
            if (shape && !byShape[shape]) byShape[shape] = key;
        }
    }

    for (let t in found) {
        if (!found[t]) found[t] = byShape[t] || null;
    }
    return found;
}

// ================= HELPERS =================
function readData(key) {
    return key ? (parseArray(key) || []) : [];
}

function getValue(obj, ...keys) {
    if (!obj) return "";
    for (let key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
            return obj[key];
        }
    }
    return "";
}

function escapeHTML(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function isActive(issue) {
    const status = String(
        getValue(issue, "status", "issueStatus", "bookStatus")
    ).toLowerCase();

    if (status) {
        return !["returned", "return", "closed", "completed"].includes(status);
    }
    return !getValue(issue, "returnedDate", "actualReturnDate", "returnedOn");
}

function getQty(book) {
    return Number(getValue(book, "qty", "quantity", "availableQuantity", "available", "copies") || 0);
}

function findBook(books, issue) {
    const id = getValue(issue, "bookId", "bookID");
    const title = String(getValue(issue, "bookTitle", "bookName", "book", "title")).toLowerCase();

    let book = null;
    if (id !== "") {
        book = books.find(b => String(getValue(b, "id", "bookId", "bookID")) === String(id));
    }
    if (!book && title) {
        book = books.find(b =>
            String(getValue(b, "name", "title", "bookName", "bookTitle")).toLowerCase() === title
        );
    }
    return book;
}

function findMember(members, issue) {
    const id = getValue(issue, "memberId", "memberID");
    const name = String(getValue(issue, "memberName", "member", "name")).toLowerCase();

    let member = null;
    if (id !== "") {
        member = members.find(m => String(getValue(m, "id", "memberId", "memberID")) === String(id));
    }
    if (!member && name) {
        member = members.find(m =>
            String(getValue(m, "name", "memberName")).toLowerCase() === name
        );
    }
    return member;
}

// ================= MAIN REPORT =================
function generateReports() {
    const keys = detectKeys();
    const books = readData(keys.books);
    const members = readData(keys.members);
    const issues = readData(keys.issues);
    const activeIssues = issues.filter(isActive);

    let availableCopies = 0;
    for (let book of books) {
        availableCopies += getQty(book);
    }

    const issuedCopies = activeIssues.length;
    const totalCopies = availableCopies + issuedCopies;

    setText("metricTotalBooks", books.length);
    setText("metricTotalCopies", totalCopies + " Total physical copies");
    setText("metricTotalMembers", members.length);
    setText("metricAvailableCopies", availableCopies);
    setText("metricIssuedCopies", issuedCopies);

    setText(
        "debugInfo",
        "Data source → Books: " + (keys.books || "not found") + " (" + books.length + ")  |  " +
        "Members: " + (keys.members || "not found") + " (" + members.length + ")  |  " +
        "Issues: " + (keys.issues || "not found") + " (" + issues.length + ")"
    );

    generateCategoryReport(books, activeIssues);
    generateActiveLoans(activeIssues, members, books);
}

// ================= CATEGORY TABLE =================
function generateCategoryReport(books, activeIssues) {
    const body = document.getElementById("categoryTableBody");
    if (!body) return;

    const categories = {};

    for (let book of books) {
        const category = getValue(book, "category") || "Others";
        if (!categories[category]) {
            categories[category] = { titles: 0, available: 0, issued: 0 };
        }
        categories[category].titles++;
        categories[category].available += getQty(book);
    }

    for (let issue of activeIssues) {
        const book = findBook(books, issue);
        const category = book ? (getValue(book, "category") || "Others") : "Others";
        if (!categories[category]) {
            categories[category] = { titles: 0, available: 0, issued: 0 };
        }
        categories[category].issued++;
    }

    body.innerHTML = "";
    const names = Object.keys(categories);

    if (names.length === 0) {
        body.innerHTML = `<tr><td colspan="4" style="text-align:center;">No books found. Add books first.</td></tr>`;
        return;
    }

    for (let name of names) {
        const c = categories[name];
        const inStock = c.available > 0;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td><span class="category-badge">${escapeHTML(name)}</span></td>
            <td>${c.titles}</td>
            <td>${c.available + c.issued}</td>
            <td><span class="${inStock ? "in-stock-tag" : "out-stock-tag"}">
                ${inStock ? "In Stock" : "Out of Stock"}</span></td>
        `;
        body.appendChild(row);
    }
}

// ================= ACTIVE LOANS TABLE =================
function generateActiveLoans(activeIssues, members, books) {
    const body = document.getElementById("activeLoansTableBody");
    if (!body) return;

    setText("activeLogTag", activeIssues.length + " Active Loans");
    body.innerHTML = "";

    if (activeIssues.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center;">No active loans</td></tr>`;
        return;
    }

    activeIssues.forEach((issue, index) => {
        const member = findMember(members, issue);
        const book = findBook(books, issue);

        const issueId = getValue(issue, "issueId", "issueID", "id") || index + 1;
        const memberName = getValue(issue, "memberName", "member", "name")
            || (member ? getValue(member, "name", "memberName") : "Unknown");
        const department = getValue(issue, "department", "dept")
            || (member ? getValue(member, "department", "dept") : "-");
        const bookTitle = getValue(issue, "bookTitle", "bookName", "book", "title")
            || (book ? getValue(book, "name", "title", "bookName") : "Unknown");
        const issueDate = getValue(issue, "issueDate", "issuedDate", "date") || "-";
        const dueDate = getValue(issue, "dueDate", "returnDate", "returnDateExpected") || "-";

        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>#${escapeHTML(issueId)}</strong></td>
            <td>${escapeHTML(memberName)}</td>
            <td>${escapeHTML(department)}</td>
            <td><strong>${escapeHTML(bookTitle)}</strong></td>
            <td>${escapeHTML(issueDate)}</td>
            <td>${escapeHTML(dueDate)}</td>
        `;
        body.appendChild(row);
    });
}

// ================= LOGOUT & AUTO-INIT =================
function logout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("lms_active_session");
        window.location.href = "../index.html";
    }
}

document.addEventListener("DOMContentLoaded", generateReports);
window.addEventListener("pageshow", generateReports);
