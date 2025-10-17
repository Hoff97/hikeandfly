export async function searchLocation(query: string) {
  // Implement the search logic here, possibly making an API call to the backend
  console.log("Searching for:", query);

  let url = new URL(window.location.origin + "/search");
  url.search = new URLSearchParams({ query }).toString();

  let response = await fetch(url);
  let body = await response.json();

  console.log("Response:", body);
}
