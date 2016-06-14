#version 150
//#extension GL_ARB_shading_language_420pack : require
#extension GL_ARB_explicit_attrib_location : require

#define TASK 10
#define ENABLE_OPACITY_CORRECTION 0
#define ENABLE_LIGHTNING 0
#define ENABLE_SHADOWING 0

in vec3 ray_entry_position;

layout(location = 0) out vec4 FragColor;

uniform mat4 Modelview;

uniform sampler3D volume_texture;
uniform sampler2D transfer_texture;


uniform vec3    camera_location;
uniform float   sampling_distance;
uniform float   sampling_distance_ref;
uniform float   iso_value;
uniform vec3    max_bounds;
uniform ivec3   volume_dimensions;

uniform vec3    light_position;
uniform vec3    light_ambient_color;
uniform vec3    light_diffuse_color;
uniform vec3    light_specular_color;
uniform float   light_ref_coef;


bool
inside_volume_bounds(const in vec3 sampling_position)
{
    return (   all(greaterThanEqual(sampling_position, vec3(0.0)))
            && all(lessThanEqual(sampling_position, max_bounds)));
}


float
get_sample_data(vec3 in_sampling_pos)
{
    vec3 obj_to_tex = vec3(1.0) / max_bounds;
    return texture(volume_texture, in_sampling_pos * obj_to_tex).r;

}

vec3
get_gradient(vec3 pos)
{
	float dim_x = volume_dimensions.x / max_bounds.x;
	float dim_y = volume_dimensions.y / max_bounds.y;
	float dim_z = volume_dimensions.z / max_bounds.z;

	vec3 prevx = pos - vec3(1/dim_x,0,0);
	vec3 nextx = pos + vec3(1/dim_x,0,0);
	vec3 prevy = pos - vec3(0,1/dim_y,0);
	vec3 nexty = pos + vec3(0,1/dim_y,0);
	vec3 prevz = pos - vec3(0,0,1/dim_z);
	vec3 nextz = pos + vec3(0,0,1/dim_z);
	float dx = get_sample_data(nextx) - get_sample_data(prevx);
	float dy = get_sample_data(nexty) - get_sample_data(prevy);
	float dz = get_sample_data(nextz) - get_sample_data(prevz);
	return normalize(vec3(dx,dy,dz));
}

void main()
{
    /// One step trough the volume
    vec3 ray_increment      = normalize(ray_entry_position - camera_location) * sampling_distance;
    /// Position in Volume
    vec3 sampling_pos       = ray_entry_position + ray_increment; // test, increment just to be sure we are in the volume

    /// Init color of fragment
    vec4 dst = vec4(0.0, 0.0, 0.0, 0.0);

    /// check if we are inside volume
    bool inside_volume = inside_volume_bounds(sampling_pos);
    
    if (!inside_volume)
        discard;

#if TASK == 10
    vec4 max_val = vec4(0.0, 0.0, 0.0, 0.0);
    
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume) 
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));
           
        // this is the example for maximum intensity projection
        max_val.r = max(color.r, max_val.r);
        max_val.g = max(color.g, max_val.g);
        max_val.b = max(color.b, max_val.b);
        max_val.a = max(color.a, max_val.a);
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    dst = max_val;
#endif 
    float s_alt=0;
    
#if TASK == 11
	vec4 avg_val = vec4(0.0 , 0.0 , 0.0 , 0.0);
	int count = 0;
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {      
        // get sample
        float s = get_sample_data(sampling_pos);

        // dummy code
        vec4 color = texture(transfer_texture, vec2(s, s));

	avg_val.r = avg_val.r + color.r;
	avg_val.g = avg_val.g + color.g;
	avg_val.b = avg_val.b + color.b;
	avg_val.a = avg_val.a + color.a;
	count++;
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }
	dst = avg_val/count;
#endif
    
#if TASK == 12 || TASK == 13
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
	dst = vec4(0,0,0,0);
    while (inside_volume)
    {
	bool hit = false;
        // get sample
        float s = get_sample_data(sampling_pos);
	if ((s-iso_value)*(s_alt-iso_value) < 0) {
		dst = vec4(light_diffuse_color, 1.0);
		hit = true;
		}
	vec3 intersect = sampling_pos;

        // increment the ray sampling position
#if TASK == 13 // Binary Search
        s = get_sample_data(sampling_pos);
	float epsilon = 0.01;
	if ((s-iso_value)*(s_alt-iso_value) < 0) {
		hit = true;
		vec3 upper = sampling_pos;
		vec3 lower = sampling_pos-ray_increment;
		while (length(upper - lower) > epsilon)
		{
			vec3 middle = (upper+lower)/2;
			if (get_sample_data(middle) > iso_value) {
				upper = middle;
			} else lower = middle;
		}
	intersect = upper;

	}  
#endif

        sampling_pos += ray_increment;
	vec3 normal = get_gradient(intersect);
	vec4 norm = vec4(normal , 1.0);
	if ((get_sample_data(intersect) - iso_value) * (s_alt-iso_value) <= 0) {
	dst = norm;
	}
#if ENABLE_LIGHTNING == 1 // Add Shading
	
	if ((get_sample_data(intersect) - iso_value) * (s_alt-iso_value) <= 0) {
	vec3 L = normalize(light_position - intersect);
	vec3 E = normalize(-intersect);
	vec3 R = normalize(-reflect(L,normal));

	
	vec4 ambient = vec4(light_ambient_color , 1.0);

	vec4 diffuse = vec4(light_diffuse_color,1.0)*max(dot(normal,L),0.0);

	vec4 specular = vec4(light_specular_color,1.0)* pow(max(dot(R,E),0.0),light_ref_coef);


	dst = ambient + diffuse + specular  ;
	}


#if ENABLE_SHADOWING == 1 // Add Shadows
        IMPLEMENTSHADOW;
#endif
#endif

        // update the loop termination condition
	if (hit) break;
	s_alt=s;
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#endif 

#if TASK == 31
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
#if ENABLE_OPACITY_CORRECTION == 1 // Opacity Correction
        IMPLEMENT;
#else
        float s = get_sample_data(sampling_pos);
#endif
        // dummy code
        dst = vec4(light_specular_color, 1.0);

        // increment the ray sampling position
        sampling_pos += ray_increment;

#if ENABLE_LIGHTNING == 1 // Add Shading
        IMPLEMENT;
#endif

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#endif 

    // return the calculated color value
    FragColor = dst;
}


