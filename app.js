// Enter key directive
app.directive('ngEnter', function() {
    return function(scope, element, attrs) {
        element.bind("keydown keypress", function(event) {
            if(event.which === 13) {
                scope.$apply(function(){
                    scope.$eval(attrs.ngEnter);
                });
                event.preventDefault();
            }
        });
    };
});

app.controller('MainController', ['$http', '$timeout', function($http, $timeout) {
    const vm = this;
    
    // Variables
    vm.searchTerm = '';
    vm.keyword = '';
    vm.showPatientForm = false;
    vm.showExistingPatient = false;
    vm.isNewPatient = false;
    vm.showNewCaseForm = false;
    vm.searchResults = [];
    vm.message = '';
    vm.messageType = '';
    vm.stats = { totalPatients: 0, totalCases: 0 };
    
    // Data models
    vm.currentPatient = {
        patient_id: '',
        name: '',
        gender: '',
        case_studies: []
    };
    
    vm.newPatientData = {
        name: '',
        gender: 'Male'
    };
    
    vm.caseData = {
        category: 'Ortho',
        symptoms: '',
        prescription: ''
    };
    
    // Initialize database
    async function initialize() {
        await DatabaseAPI.init();
        await DatabaseAPI.loadSampleData();
        await loadStats();
    }
    
    // Load statistics
    async function loadStats() {
        vm.stats = await DatabaseAPI.getStats();
        vm.$applyAsync();
    }
    
    // Search patient
    vm.searchPatient = async function() {
        if (!vm.searchTerm) {
            vm.showMessage('Please enter patient ID or name', 'error');
            return;
        }
        
        const db = DatabaseAPI.getDB();
        const transaction = db.transaction(['patients'], 'readonly');
        const store = transaction.objectStore('patients');
        
        // Try to get by patient_id first
        const getById = store.get(vm.searchTerm);
        
        getById.onsuccess = async function() {
            if (getById.result) {
                await loadPatientWithCases(getById.result);
            } else {
                // Search by name
                const index = store.index('name');
                const range = IDBKeyRange.bound(vm.searchTerm.toLowerCase(), vm.searchTerm.toLowerCase() + '\uffff');
                const nameSearch = index.openCursor(range);
                let found = false;
                
                nameSearch.onsuccess = function(event) {
                    const cursor = event.target.result;
                    if (cursor && !found) {
                        if (cursor.value.name.toLowerCase().includes(vm.searchTerm.toLowerCase())) {
                            loadPatientWithCases(cursor.value);
                            found = true;
                        } else {
                            cursor.continue();
                        }
                    }
                    if (!found && !cursor) {
                        vm.isNewPatient = true;
                        vm.showPatientForm = true;
                        vm.showExistingPatient = false;
                        vm.newPatientData.name = vm.searchTerm;
                        vm.showMessage('Patient not found. Please register new patient.', 'success');
                        vm.$applyAsync();
                    }
                };
            }
        };
    };
    
    // Load patient with case studies
    async function loadPatientWithCases(patient) {
        vm.currentPatient = patient;
        vm.currentPatient.case_studies = [];
        
        const db = DatabaseAPI.getDB();
        const transaction = db.transaction(['case_studies'], 'readonly');
        const index = transaction.objectStore('case_studies').index('patient_id');
        const cases = index.getAll(patient.patient_id);
        
        cases.onsuccess = function() {
            vm.currentPatient.case_studies = cases.result || [];
            vm.isNewPatient = false;
            vm.showPatientForm = true;
            vm.showExistingPatient = true;
            vm.caseData = { category: 'Ortho', symptoms: '', prescription: '' };
            vm.showMessage('Patient found!', 'success');
            vm.$applyAsync();
        };
    }
    
    // Search by keyword
    vm.searchByKeyword = async function() {
        if (!vm.keyword) {
            vm.showMessage('Please enter keywords to search', 'error');
            return;
        }
        
        const db = DatabaseAPI.getDB();
        const transaction = db.transaction(['case_studies', 'patients'], 'readonly');
        const caseStore = transaction.objectStore('case_studies');
        const patientStore = transaction.objectStore('patients');
        const allCases = caseStore.getAll();
        const keywordLower = vm.keyword.toLowerCase();
        const results = [];
        
        allCases.onsuccess = function() {
            const cases = allCases.result;
            const matchingCases = cases.filter(c => 
                c.symptoms.toLowerCase().includes(keywordLower) || 
                c.prescription.toLowerCase().includes(keywordLower)
            );
            
            if (matchingCases.length === 0) {
                vm.searchResults = [];
                vm.showMessage('No results found', 'error');
                vm.$applyAsync();
                return;
            }
            
            let processed = 0;
            matchingCases.forEach(caseStudy => {
                const getPatient = patientStore.get(caseStudy.patient_id);
                getPatient.onsuccess = function() {
                    results.push({
                        ...caseStudy,
                        name: getPatient.result.name,
                        gender: getPatient.result.gender
                    });
                    processed++;
                    if (processed === matchingCases.length) {
                        vm.searchResults = results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                        vm.showMessage(`Found ${results.length} results`, 'success');
                        vm.$applyAsync();
                    }
                };
            });
        };
    };
    
    // Save new patient
    vm.savePatient = async function() {
        if (!vm.newPatientData.name || !vm.caseData.symptoms || !vm.caseData.prescription) {
            vm.showMessage('Please fill all required fields', 'error');
            return;
        }
        
        const patientId = 'PAT' + Date.now();
        const newPatient = {
            patient_id: patientId,
            name: vm.newPatientData.name,
            gender: vm.newPatientData.gender,
            created_at: new Date().toISOString()
        };
        
        const newCase = {
            patient_id: patientId,
            category: vm.caseData.category,
            symptoms: vm.caseData.symptoms,
            prescription: vm.caseData.prescription,
            created_at: new Date().toISOString()
        };
        
        const db = DatabaseAPI.getDB();
        const transaction = db.transaction(['patients', 'case_studies'], 'readwrite');
        const patientStore = transaction.objectStore('patients');
        const caseStore = transaction.objectStore('case_studies');
        
        patientStore.add(newPatient);
        caseStore.add(newCase);
        
        transaction.oncomplete = function() {
            vm.showMessage(`Patient registered successfully! ID: ${patientId}`, 'success');
            loadStats();
            vm.resetForm();
            setTimeout(() => {
                vm.searchTerm = patientId;
                vm.searchPatient();
            }, 500);
        };
        
        transaction.onerror = function() {
            vm.showMessage('Error saving patient', 'error');
        };
    };
    
    // Add case study
    vm.addCaseStudy = async function() {
        if (!vm.caseData.symptoms || !vm.caseData.prescription) {
            vm.showMessage('Please fill symptoms and prescription', 'error');
            return;
        }
        
        const newCase = {
            patient_id: vm.currentPatient.patient_id,
            category: vm.caseData.category,
            symptoms: vm.caseData.symptoms,
            prescription: vm.caseData.prescription,
            created_at: new Date().toISOString()
        };
        
        const db = DatabaseAPI.getDB();
        const transaction = db.transaction(['case_studies'], 'readwrite');
        const caseStore = transaction.objectStore('case_studies');
        caseStore.add(newCase);
        
        transaction.oncomplete = function() {
            vm.showMessage('Case study added successfully!', 'success');
            loadStats();
            loadPatientWithCases(vm.currentPatient);
            vm.caseData = { category: 'Ortho', symptoms: '', prescription: '' };
            vm.showNewCaseForm = false;
            vm.$applyAsync();
        };
    };
    
    // View patient from search results
    vm.viewPatient = function(patientId) {
        vm.searchTerm = patientId;
        vm.searchPatient();
        vm.searchResults = [];
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    
    // Cancel form
    vm.cancelForm = function() {
        vm.resetForm();
    };
    
    // Reset form
    vm.resetForm = function() {
        vm.showPatientForm = false;
        vm.showExistingPatient = false;
        vm.isNewPatient = false;
        vm.showNewCaseForm = false;
        vm.currentPatient = { patient_id: '', name: '', gender: '', case_studies: [] };
        vm.newPatientData = { name: '', gender: 'Male' };
        vm.caseData = { category: 'Ortho', symptoms: '', prescription: '' };
        vm.searchTerm = '';
        vm.keyword = '';
    };
    
    // Show message
    vm.showMessage = function(msg, type) {
        vm.message = msg;
        vm.messageType = type;
        $timeout(function() {
            vm.message = '';
        }, 5000);
    };
    
    // Initialize the application
    initialize();
}]);