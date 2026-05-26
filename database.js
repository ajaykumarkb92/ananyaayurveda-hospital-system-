// Database configuration and operations
const DB_NAME = 'AyurvedicHospitalDB';
const DB_VERSION = 1;

let db = null;

// Initialize IndexedDB
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject(event.target.error);
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database opened successfully');
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            
            // Create patients store
            if (!db.objectStoreNames.contains('patients')) {
                const patientStore = db.createObjectStore('patients', { keyPath: 'patient_id' });
                patientStore.createIndex('name', 'name', { unique: false });
                patientStore.createIndex('gender', 'gender', { unique: false });
                patientStore.createIndex('created_at', 'created_at', { unique: false });
            }
            
            // Create case studies store
            if (!db.objectStoreNames.contains('case_studies')) {
                const caseStore = db.createObjectStore('case_studies', { keyPath: 'id', autoIncrement: true });
                caseStore.createIndex('patient_id', 'patient_id', { unique: false });
                caseStore.createIndex('category', 'category', { unique: false });
                caseStore.createIndex('symptoms', 'symptoms', { unique: false });
                caseStore.createIndex('prescription', 'prescription', { unique: false });
                caseStore.createIndex('created_at', 'created_at', { unique: false });
            }
        };
    });
}

// Load sample data
async function loadSampleData() {
    const transaction = db.transaction(['patients'], 'readonly');
    const patientStore = transaction.objectStore('patients');
    const countRequest = patientStore.count();
    
    return new Promise((resolve) => {
        countRequest.onsuccess = async () => {
            if (countRequest.result === 0) {
                // Add sample patients
                const samplePatients = [
                    { patient_id: 'PAT001', name: 'Rajesh Kumar', gender: 'Male', created_at: new Date().toISOString() },
                    { patient_id: 'PAT002', name: 'Sunita Sharma', gender: 'Female', created_at: new Date().toISOString() }
                ];
                
                const writeTransaction = db.transaction(['patients'], 'readwrite');
                const writeStore = writeTransaction.objectStore('patients');
                samplePatients.forEach(patient => writeStore.add(patient));
                
                // Add sample case studies
                const caseTransaction = db.transaction(['case_studies'], 'readwrite');
                const caseStore = caseTransaction.objectStore('case_studies');
                
                const sampleCases = [
                    { patient_id: 'PAT001', category: 'Ortho', symptoms: 'Severe knee pain, difficulty walking, swelling in joints', prescription: 'Ashwagandha powder 5g twice daily, Dashmoolarishta 20ml after meals', created_at: new Date().toISOString() },
                    { patient_id: 'PAT001', category: 'Nephro', symptoms: 'Frequent urination at night, lower back pain', prescription: 'Punarnava mandur 2 tablets thrice daily, Gokshuradi guggulu', created_at: new Date().toISOString() },
                    { patient_id: 'PAT002', category: 'Ortho', symptoms: 'Neck stiffness, shoulder pain, numbness in fingers', prescription: 'Rasnadi guggulu, Maharasnadi kwath', created_at: new Date().toISOString() }
                ];
                
                sampleCases.forEach(caseStudy => caseStore.add(caseStudy));
                
                await Promise.all([
                    new Promise(resolve => writeTransaction.oncomplete = resolve),
                    new Promise(resolve => caseTransaction.oncomplete = resolve)
                ]);
            }
            resolve();
        };
    });
}

// Get database stats
async function getDatabaseStats() {
    const patientTransaction = db.transaction(['patients'], 'readonly');
    const patientStore = patientTransaction.objectStore('patients');
    const patientCount = await new Promise((resolve) => {
        const request = patientStore.count();
        request.onsuccess = () => resolve(request.result);
    });
    
    const caseTransaction = db.transaction(['case_studies'], 'readonly');
    const caseStore = caseTransaction.objectStore('case_studies');
    const caseCount = await new Promise((resolve) => {
        const request = caseStore.count();
        request.onsuccess = () => resolve(request.result);
    });
    
    return { totalPatients: patientCount, totalCases: caseCount };
}

// Export functions for use in app.js
window.DatabaseAPI = {
    init: initDatabase,
    loadSampleData: loadSampleData,
    getStats: getDatabaseStats,
    getDB: () => db
};