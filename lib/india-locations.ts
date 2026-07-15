export interface IndiaLocationEntry {
  state: string;
  city: string;
  villages: string[];
}

export const INDIA_LOCATIONS: IndiaLocationEntry[] = [
  { state: "Rajasthan", city: "Jodhpur", villages: ["Mandore", "Osian", "Salawas", "Balesar", "Bilara", "Luni"] },
  { state: "Rajasthan", city: "Jaipur", villages: ["Amer", "Bagru", "Sanganer", "Chomu", "Viratnagar"] },
  { state: "Rajasthan", city: "Udaipur", villages: ["Shilpgram", "Badgaon", "Girwa", "Bhinder", "Gogunda"] },
  { state: "Maharashtra", city: "Mumbai", villages: ["Gorai", "Madh", "Marve", "Manori"] },
  { state: "Maharashtra", city: "Pune", villages: ["Mulshi", "Lavasa", "Junnar", "Pimpri", "Talegaon"] },
  { state: "Delhi", city: "New Delhi", villages: ["Hauz Khas", "Mehrauli", "Shahpur Jat", "Nizamuddin"] },
  { state: "Karnataka", city: "Bengaluru", villages: ["Yelahanka", "Anekal", "Devanahalli", "Hesaraghatta"] },
  { state: "Tamil Nadu", city: "Chennai", villages: ["Muttukadu", "Mahabalipuram", "Kovalam", "ECR"] },
  { state: "West Bengal", city: "Kolkata", villages: ["Rajarhat", "Baruipur", "Bakkhali", "Diamond Harbour"] },
  { state: "Gujarat", city: "Ahmedabad", villages: ["Adalaj", "Sanand", "Dholka", "Kheda"] },
  { state: "Kerala", city: "Kochi", villages: ["Fort Kochi", "Mattancherry", "Aluva", "Kumbalangi"] },
  { state: "Uttar Pradesh", city: "Varanasi", villages: ["Sarnath", "Ramnagar", "Chiraigaon", "Pindra"] },
  { state: "Uttarakhand", city: "Dehradun", villages: ["Mussoorie", "Maldevta", "Dhanaulti", "Rishikesh"] },
  { state: "Goa", city: "Panaji", villages: ["Dona Paula", "Candolim", "Assagao", "Anjuna"] },
  { state: "Himachal Pradesh", city: "Shimla", villages: ["Kufri", "Mashobra", "Naldehra", "Theog"] }
];

export const INDIAN_STATES = Array.from(
  new Set(INDIA_LOCATIONS.map((entry) => entry.state))
).sort();
