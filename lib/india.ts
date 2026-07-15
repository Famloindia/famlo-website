export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal"
] as const;

export const STATE_TO_CITIES: Record<string, string[]> = {
  "Andhra Pradesh": [
    "Visakhapatnam",
    "Vijayawada",
    "Tirupati",
    "Rajahmundry",
    "Kurnool",
    "Nellore",
    "Guntur",
    "Anantapur"
  ],
  Assam: [
    "Guwahati",
    "Kaziranga",
    "Jorhat",
    "Dibrugarh",
    "Tezpur",
    "Silchar",
    "Sivasagar",
    "Majuli"
  ],
  Bihar: [
    "Patna",
    "Gaya",
    "Nalanda",
    "Muzaffarpur",
    "Bhagalpur",
    "Purnia",
    "Darbhanga",
    "Bodh Gaya"
  ],
  Chhattisgarh: [
    "Raipur",
    "Jagdalpur",
    "Bilaspur",
    "Durg",
    "Korba",
    "Ambikapur",
    "Rajnandgaon",
    "Raigarh"
  ],
  Delhi: [
    "New Delhi",
    "South Delhi",
    "Old Delhi",
    "Dwarka",
    "Rohini",
    "Saket",
    "Karol Bagh",
    "Lajpat Nagar"
  ],
  Goa: [
    "Panaji",
    "Margao",
    "Mapusa",
    "Vasco da Gama",
    "Candolim",
    "Calangute",
    "Anjuna",
    "Palolem"
  ],
  Gujarat: [
    "Ahmedabad",
    "Kutch",
    "Vadodara",
    "Surat",
    "Rajkot",
    "Bhavnagar",
    "Somnath",
    "Dwarka"
  ],
  Haryana: [
    "Gurugram",
    "Faridabad",
    "Kurukshetra",
    "Panipat",
    "Hisar",
    "Karnal",
    "Ambala",
    "Sonipat"
  ],
  "Himachal Pradesh": [
    "Shimla",
    "Manali",
    "Dharamshala",
    "Kasol",
    "Kullu",
    "Dalhousie",
    "Spiti",
    "Mcleodganj"
  ],
  "Jammu and Kashmir": [
    "Srinagar",
    "Jammu",
    "Pahalgam",
    "Gulmarg",
    "Sonamarg",
    "Anantnag",
    "Baramulla",
    "Pulwama"
  ],
  Jharkhand: [
    "Ranchi",
    "Jamshedpur",
    "Deoghar",
    "Dhanbad",
    "Hazaribagh",
    "Bokaro",
    "Giridih",
    "Netarhat"
  ],
  Karnataka: [
    "Bengaluru",
    "Mysuru",
    "Hampi",
    "Mangaluru",
    "Coorg",
    "Hubballi",
    "Chikkamagaluru",
    "Udupi"
  ],
  Kerala: [
    "Kochi",
    "Munnar",
    "Thiruvananthapuram",
    "Kozhikode",
    "Alappuzha",
    "Wayanad",
    "Kannur",
    "Thrissur"
  ],
  "Madhya Pradesh": [
    "Bhopal",
    "Indore",
    "Khajuraho",
    "Gwalior",
    "Jabalpur",
    "Ujjain",
    "Orchha",
    "Sanchi"
  ],
  Maharashtra: [
    "Mumbai",
    "Pune",
    "Nashik",
    "Nagpur",
    "Aurangabad",
    "Kolhapur",
    "Lonavala",
    "Mahabaleshwar"
  ],
  Odisha: [
    "Bhubaneswar",
    "Puri",
    "Cuttack",
    "Rourkela",
    "Sambalpur",
    "Konark",
    "Berhampur",
    "Chandipur"
  ],
  Punjab: [
    "Amritsar",
    "Ludhiana",
    "Chandigarh",
    "Patiala",
    "Jalandhar",
    "Bathinda",
    "Mohali",
    "Anandpur Sahib"
  ],
  Rajasthan: [
    "Jaipur",
    "Jodhpur",
    "Udaipur",
    "Jaisalmer",
    "Pushkar",
    "Bikaner",
    "Ajmer",
    "Mount Abu"
  ],
  "Tamil Nadu": [
    "Chennai",
    "Madurai",
    "Coimbatore",
    "Pudukkottai",
    "Tiruchirappalli",
    "Ooty",
    "Kanyakumari",
    "Salem"
  ],
  Telangana: [
    "Hyderabad",
    "Warangal",
    "Karimnagar",
    "Nizamabad",
    "Khammam",
    "Medak",
    "Siddipet",
    "Adilabad"
  ],
  "Uttar Pradesh": [
    "Lucknow",
    "Varanasi",
    "Agra",
    "Prayagraj",
    "Kanpur",
    "Noida",
    "Mathura",
    "Ayodhya"
  ],
  Uttarakhand: [
    "Dehradun",
    "Rishikesh",
    "Nainital",
    "Mussoorie",
    "Haridwar",
    "Almora",
    "Auli",
    "Bhimtal"
  ],
  "West Bengal": [
    "Kolkata",
    "Darjeeling",
    "Siliguri",
    "Digha",
    "Kalimpong",
    "Shantiniketan",
    "Howrah",
    "Murshidabad"
  ]
};

export const COMMON_LANGUAGE_OPTIONS = [
  "English",
  "Hindi",
  "Spanish",
  "French",
  "Arabic",
  "German",
  "Tamil",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Punjabi",
  "Telugu",
  "Malayalam",
  "Kannada",
  "Other"
] as const;
