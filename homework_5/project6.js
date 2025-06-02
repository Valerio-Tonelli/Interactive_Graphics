var raytraceFS = `
struct Ray {
	vec3 pos;
	vec3 dir;
};

struct Material {
	vec3  k_d;	// diffuse coefficient
	vec3  k_s;	// specular coefficient
	float n;	// specular exponent
};

struct Sphere {
	vec3     center;
	float    radius;
	Material mtl;
};

struct Light {
	vec3 position;
	vec3 intensity;
};

struct HitInfo {
	float    t;
	vec3     position;
	vec3     normal;
	Material mtl;
};

uniform Sphere spheres[ NUM_SPHERES ];
uniform Light  lights [ NUM_LIGHTS  ];
uniform samplerCube envMap;
uniform int bounceLimit;

bool IntersectRay( inout HitInfo hit, Ray ray );

// Shades the given point and returns the computed color.
vec3 Shade( Material mtl, vec3 position, vec3 normal, vec3 view )
{
	vec3 color = vec3(0,0,0);
	for ( int i=0; i<NUM_LIGHTS; ++i ) {
		// TO-DO: Check for shadows
		// TO-DO: If not shadowed, perform shading using the Blinn model

		Ray shadowRay;
		shadowRay.pos = position + normal * 0.001; // Offset to avoid self-intersection
		shadowRay.dir = normalize(lights[i].position - position);
		
		HitInfo shadowHit;
		bool inShadow = IntersectRay(shadowHit, shadowRay);
		
		// Check if shadow ray hits something before reaching the light
		float distanceToLight = length(lights[i].position - position);
		if (inShadow && shadowHit.t < distanceToLight) {
			continue; // Skip this light, we're in shadow
		}
		// TO-DO: If not shadowed, perform shading using the Blinn model
		vec3 lightDir = normalize(lights[i].position - position);
		vec3 halfVector = normalize(lightDir + view);
		
		// Diffuse component (Lambert)
		float NdotL = max(dot(normal, lightDir), 0.0);
		vec3 diffuse = mtl.k_d * lights[i].intensity * NdotL;
		
		// Specular component (Blinn-Phong)
		float NdotH = max(dot(normal, halfVector), 0.0);
		vec3 specular = mtl.k_s * lights[i].intensity * pow(NdotH, mtl.n);
		
		color += diffuse + specular;
	}
	return color;
}

// Intersects the given ray with all spheres in the scene
// and updates the given HitInfo using the information of the sphere
// that first intersects with the ray.
// Returns true if an intersection is found.
bool IntersectRay( inout HitInfo hit, Ray ray )
{
	hit.t = 1e30;
	bool foundHit = false;
	for ( int i=0; i<NUM_SPHERES; ++i ) {
		// TO-DO: Test for ray-sphere intersection
		// TO-DO: If intersection is found, update the given HitInfo

		vec3 oc = ray.pos - spheres[i].center;
		float a = dot(ray.dir, ray.dir);
		float b = 2.0 * dot(oc, ray.dir);
		float c = dot(oc, oc) - spheres[i].radius * spheres[i].radius;
		
		float discriminant = b * b - 4.0 * a * c;
		
		// If discriminant >= 0, we have intersection(s)
		if (discriminant >= 0.0) {
			float sqrt_discriminant = sqrt(discriminant);
			float t1 = (-b - sqrt_discriminant) / (2.0 * a);
			float t2 = (-b + sqrt_discriminant) / (2.0 * a);
			
			// We want the closest positive intersection
			float t = (t1 > 0.0) ? t1 : t2;
			
			// If intersection is found and closer than previous hits, update HitInfo
			if (t > 0.0 && t < hit.t) {
				hit.t = t;
				hit.position = ray.pos + t * ray.dir;
				hit.normal = normalize(hit.position - spheres[i].center);
				hit.mtl = spheres[i].mtl;
				foundHit = true;
			}
		}
	}
	return foundHit;
}

// Given a ray, returns the shaded color where the ray intersects a sphere.
// If the ray does not hit a sphere, returns the environment color.
vec4 RayTracer( Ray ray )
{
	HitInfo hit;
	if ( IntersectRay( hit, ray ) ) {
		vec3 view = normalize( -ray.dir );
		vec3 clr = Shade( hit.mtl, hit.position, hit.normal, view );
		
		// Compute reflections
		vec3 k_s = hit.mtl.k_s;
		for ( int bounce=0; bounce<MAX_BOUNCES; ++bounce ) {
			if ( bounce >= bounceLimit ) break;
			if ( hit.mtl.k_s.r + hit.mtl.k_s.g + hit.mtl.k_s.b <= 0.0 ) break;
			
			Ray r;	// this is the reflection ray
			HitInfo h;	// reflection hit info

			// TO-DO: Initialize the reflection ray
			r.pos = hit.position + hit.normal * 0.001; // Offset to avoid self-intersection
			r.dir = reflect(ray.dir, hit.normal); // Compute reflection direction
			
			if ( IntersectRay( h, r ) ) {
				// TO-DO: Hit found, so shade the hit point
				// TO-DO: Update the loop variables for tracing the next reflection ray

				vec3 reflectedView = normalize(-r.dir);
				vec3 reflectedColor = Shade(h.mtl, h.position, h.normal, reflectedView);
				clr += k_s * reflectedColor;
				
				// Update the loop variables for tracing the next reflection ray
				ray = r;        // The reflection ray becomes the new ray
				hit = h;        // The reflection hit becomes the new hit
				k_s *= h.mtl.k_s; // Attenuate reflection coefficient
			} else {
				// The refleciton ray did not intersect with anything,
				// so we are using the environment color
				clr += k_s * textureCube( envMap, r.dir.xzy ).rgb;
				break;	// no more reflections
			}
		}
		return vec4( clr, 1 );	// return the accumulated color, including the reflections
	} else {
		return vec4( textureCube( envMap, ray.dir.xzy ).rgb, 0 );	// return the environment color
	}
}
`;