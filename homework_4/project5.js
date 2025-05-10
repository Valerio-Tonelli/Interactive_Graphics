// This function takes the translation and two rotation angles (in radians) as input arguments.
// The two rotations are applied around x and y axes.
// It returns the combined 4x4 transformation matrix as an array in column-major order.
function GetModelViewMatrix( translationX, translationY, translationZ, rotationX, rotationY )
{
    // Form the translation matrix
    let trans = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        translationX, translationY, translationZ, 1
    ];

    // Form the rotation matrix around x-axis
    let rotX = [
        1, 0, 0, 0,
        0, Math.cos(rotationX), Math.sin(rotationX), 0,
        0, -Math.sin(rotationX), Math.cos(rotationX), 0,
        0, 0, 0, 1
    ];

    // Form the rotation matrix around y-axis
    let rotY = [
        Math.cos(rotationY), 0, -Math.sin(rotationY), 0,
        0, 1, 0, 0,
        Math.sin(rotationY), 0, Math.cos(rotationY), 0,
        0, 0, 0, 1
    ];
    
    // Multiply the rotation matrices
    let rotation = MatrixMult(rotY, rotX);
    
    // Apply translation after rotation
    let mv = MatrixMult(trans, rotation);

    return mv;
}

// [TO-DO] Complete the implementation of the following class.
class MeshDrawer
{
    // The constructor is a good place for taking care of the necessary initializations.
    constructor()
    {
        // [TO-DO] initializations
        this.prog = InitShaderProgram(meshVS, meshFS);
        
        // Get the ids of the uniform variables in the shaders
        this.mvpLoc = gl.getUniformLocation(this.prog, 'mvp');
        this.mvLoc = gl.getUniformLocation(this.prog, 'mv');
        this.normalLoc = gl.getUniformLocation(this.prog, 'normal');
        this.yzSwapLoc = gl.getUniformLocation(this.prog, 'swapYZ');
        this.usingTexture = gl.getUniformLocation(this.prog, 'usingTexture');
        this.sampler = gl.getUniformLocation(this.prog, 'tex');
        this.lightDir = gl.getUniformLocation(this.prog, 'ltDir');
        this.alpha = gl.getUniformLocation(this.prog, 'alpha');
        
        // Get the ids of the vertex attributes in the shaders
        this.vertPos = gl.getAttribLocation(this.prog, 'vert_pos');
        this.vertTxc = gl.getAttribLocation(this.prog, 'vert_txc');
        this.vertNormal = gl.getAttribLocation(this.prog, 'vert_n');
        
        // Create buffers
        this.vertPosbuffer = gl.createBuffer();
        this.texcoordbuffer = gl.createBuffer();
        this.vertNormalbuffer = gl.createBuffer();
        
        // Create texture
        this.texture = gl.createTexture();
        
        this.numTriangles = 0;
    }
    
    // This method is called every time the user opens an OBJ file.
	// The arguments of this function is an array of 3D vertex positions,
	// an array of 2D texture coordinates, and an array of vertex normals.
	// Every item in these arrays is a floating point value, representing one
	// coordinate of the vertex position or texture coordinate.
	// Every three consecutive elements in the vertPos array forms one vertex
	// position and every three consecutive vertex positions form a triangle.
	// Similarly, every two consecutive elements in the texCoords array
	// form the texture coordinate of a vertex and every three consecutive 
	// elements in the normals array form a vertex normal.
	// Note that this method can be called multiple times.
    setMesh(vertPos, texCoords, normals)
    {
		// [TO-DO] Update the contents of the vertex buffer objects.
        this.numTriangles = vertPos.length / 3;
        
        // Update the vertex position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertPosbuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertPos), gl.STATIC_DRAW);
        
        // Update the texture coordinate buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordbuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
        
        // Update the vertex normal buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertNormalbuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    }
    
    // This method is called when the user changes the state of the
    // "Swap Y-Z Axes" checkbox. 
    // The argument is a boolean that indicates if the checkbox is checked.
    swapYZ(swap)
    {
		// [TO-DO] Set the uniform parameter(s) of the vertex shader
        gl.useProgram(this.prog);
        if(swap) {
            gl.uniform1f(this.yzSwapLoc, 1.0);
        } else {
            gl.uniform1f(this.yzSwapLoc, 0.0);
        }
    }
    
    // This method is called to draw the triangular mesh.
	// The arguments are the model-view-projection transformation matrixMVP,
	// the model-view transformation matrixMV, the same matrix returned
	// by the GetModelViewProjection function above, and the normal
	// transformation matrix, which is the inverse-transpose of matrixMV
    draw(matrixMVP, matrixMV, matrixNormal)
    {
		// [TO-DO] Complete the WebGL initializations before drawing
        gl.useProgram(this.prog);
        
        // Set the uniform variables
        gl.uniformMatrix4fv(this.mvpLoc, false, matrixMVP);
        gl.uniformMatrix4fv(this.mvLoc, false, matrixMV);
        gl.uniformMatrix3fv(this.normalLoc, false, matrixNormal);
        
        // Set up the vertex position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertPosbuffer);
        gl.vertexAttribPointer(this.vertPos, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.vertPos);
        
        // Set up the vertex normal attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertNormalbuffer);
        gl.vertexAttribPointer(this.vertNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.vertNormal);
        
        // Set up the texture coordinate attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordbuffer);
        gl.vertexAttribPointer(this.vertTxc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.vertTxc);
        
        // Draw the triangles
        gl.drawArrays(gl.TRIANGLES, 0, this.numTriangles);
    }
    
    // This method is called to set the texture of the mesh.
    // The argument is an HTML IMG element containing the texture data.
    setTexture(img)
    {
		// [TO-DO] Bind the texture
        gl.useProgram(this.prog);
        
        // Bind the texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        // Set texture parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        
        // Set the texture image data
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);

		// [TO-DO] Now that we have a texture, it might be a good idea to set
		// some uniform parameter(s) of the fragment shader, so that it uses the texture.
        gl.uniform1f(this.usingTexture, 1.0);
        gl.uniform1i(this.sampler, 0);
    }
    
    // This method is called when the user changes the state of the
    // "Show Texture" checkbox. 
    // The argument is a boolean that indicates if the checkbox is checked.
    showTexture(show)
    {
		// [TO-DO] set the uniform parameter(s) of the fragment shader to specify if it should use the texture.
        gl.useProgram(this.prog);
        if(show) {
            gl.uniform1f(this.usingTexture, 1.0);
        } else {
            gl.uniform1f(this.usingTexture, 0.0);
        }
    }
    
    // This method is called to set the incoming light direction
    setLightDir(x, y, z)
    {
		// [TO-DO] set the uniform parameter(s) of the fragment shader to specify the light direction.
        var ltDir = [x, y, z];
        gl.useProgram(this.prog);
        gl.uniform3fv(this.lightDir, ltDir);
    }
    
    // This method is called to set the shininess of the material
    setShininess(shininess)
    {
		// [TO-DO] set the uniform parameter(s) of the fragment shader to specify the shininess.
        gl.useProgram(this.prog);
        gl.uniform1f(this.alpha, shininess);
    }
}

// Vertex shader source code
const meshVS = `
    attribute vec3 vert_pos;
    attribute vec3 vert_n;
    attribute vec2 vert_txc;
    
    uniform mat4 mvp;
    uniform mat4 mv;
    uniform mat3 normal;
    uniform float swapYZ;
    
    varying vec2 frag_txc;
    varying vec3 frag_n;
    varying vec4 frag_pos;
    
    void main()
    {
        if(swapYZ > 0.5) {
            gl_Position = mvp * vec4(vert_pos[0], vert_pos[2], vert_pos[1], 1.0);
            frag_pos = mv * vec4(vert_pos[0], vert_pos[2], vert_pos[1], 1.0);
            frag_n = normal * vec3(vert_n[0], vert_n[2], vert_n[1]);
        } else {
            gl_Position = mvp * vec4(vert_pos, 1.0);
            frag_pos = mv * vec4(vert_pos, 1.0);
            frag_n = normal * vert_n;
        }
        
        frag_txc = vert_txc;
    }
`;

// Fragment shader source code
const meshFS = `
    precision mediump float;
    
    uniform sampler2D tex;
    uniform float usingTexture;
    uniform vec3 ltDir;
    uniform float alpha;
    
    varying vec2 frag_txc;
    varying vec3 frag_n;
    varying vec4 frag_pos;
    
    void main()
    {
        vec4 color;
        if(usingTexture > 0.5) {
            color = texture2D(tex, frag_txc);
        } else {
            color = vec4(0.85, 0.85, 0.85, 1.0);
        }
        
        vec3 diffuseColor = color.rgb;
        vec3 h = normalize(ltDir - frag_pos.xyz);
        vec3 specularColor = vec3(1.0, 1.0, 1.0);
        vec3 specular = (pow(max(dot(frag_n, h), 0.0), alpha)/dot(frag_n, ltDir)) * specularColor;
        
        vec3 ambient = color.rgb * 0.2;
        vec3 ltColor = vec3(1.0, 1.0, 1.0);
        vec3 lt = ltColor * max(dot(frag_n, ltDir), 0.0);
        
        vec3 C = ambient + (lt * (diffuseColor + specular));
        gl_FragColor = vec4(C, color.a);
    }
`;